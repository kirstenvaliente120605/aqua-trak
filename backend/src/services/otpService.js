import crypto from "node:crypto";
import { findUserByEmail, hashPassword, pool } from "./authStore.js";
import { sendOtpEmail } from "../../../emailService.js";

const positiveSetting = (name, fallback, maximum) => {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
};

const expiryMinutes = positiveSetting("OTP_EXPIRY_MINUTES", 10, 60);
const maxAttempts = positiveSetting("OTP_MAX_ATTEMPTS", 5, 10);
const cooldownSeconds = positiveSetting("OTP_RESEND_COOLDOWN_SECONDS", 60, 3600);

export function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

function hashOtp(code, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(code, salt, 64).toString("hex")}`;
}

function matchesOtp(code, stored) {
  const [salt, digest] = String(stored || "").split(":");
  if (!salt || !digest || !/^\d{6}$/.test(code)) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = crypto.scryptSync(code, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

async function addRateLimitHit(scope, keyHash, action) {
  await pool.execute(
    `INSERT INTO node_otp_rate_limits (scope, key_hash, action, window_started_at, request_count)
     VALUES (?, ?, ?, NOW(), 1)
     ON DUPLICATE KEY UPDATE
       request_count = IF(window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), 1, request_count + 1),
       window_started_at = IF(window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW(), window_started_at)`,
    [scope, keyHash, action]
  );
  const [rows] = await pool.execute(
    "SELECT request_count FROM node_otp_rate_limits WHERE scope = ? AND key_hash = ? AND action = ?",
    [scope, keyHash, action]
  );
  return Number(rows[0]?.request_count || 0);
}

async function withinRateLimits(email, ip, action, emailLimit = 5, ipLimit = 20) {
  const [emailCount, ipCount] = await Promise.all([
    addRateLimitHit("email", crypto.createHash("sha256").update(email).digest("hex"), action),
    addRateLimitHit("ip", crypto.createHash("sha256").update(ip).digest("hex"), action),
  ]);
  return emailCount <= emailLimit && ipCount <= ipLimit;
}

export async function issueOtp(email, userId, purpose, ip) {
  if (!["verify_email", "reset_password"].includes(purpose)) return { ok: false, code: "INVALID_PURPOSE" };
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!await withinRateLimits(normalizedEmail, String(ip || "unknown"), `send:${purpose}`)) {
    return { ok: false, code: "OTP_RATE_LIMITED" };
  }
  if (!userId) return { ok: true };

  const [latestRows] = await pool.execute(
    "SELECT created_at FROM node_email_otps WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1",
    [normalizedEmail, purpose]
  );
  if (latestRows[0] && Date.now() - new Date(latestRows[0].created_at).getTime() < cooldownSeconds * 1000) {
    return { ok: false, code: "OTP_COOLDOWN" };
  }

  const code = generateOtp();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      "UPDATE node_email_otps SET used_at = COALESCE(used_at, NOW()) WHERE email = ? AND purpose = ? AND used_at IS NULL",
      [normalizedEmail, purpose]
    );
    await connection.execute(
      `INSERT INTO node_email_otps (email, user_id, code_hash, purpose, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ${expiryMinutes} MINUTE), 0, NOW())`,
      [normalizedEmail, userId, hashOtp(code), purpose]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    await sendOtpEmail({ to: normalizedEmail, code, purpose });
  } catch {
    console.error("OTP email delivery failed; provider details suppressed.");
    return { ok: false, code: "OTP_DELIVERY_FAILED" };
  }
  if (process.env.APP_ENV === "development" && process.env.OTP_DEBUG === "true") {
    console.error(`OTP_DEBUG ${purpose} code for ${normalizedEmail}: ${code}`);
  }
  return { ok: true };
}

export async function verifyOtp(email, code, purpose, ip = "unknown") {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!["verify_email", "reset_password"].includes(purpose) || !/^\d{6}$/.test(code)) {
    return { ok: false, code: "OTP_INVALID" };
  }
  if (!await withinRateLimits(normalizedEmail, String(ip || "unknown"), `verify:${purpose}`, 10, 50)) {
    return { ok: false, code: "OTP_RATE_LIMITED" };
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      "SELECT id, user_id, code_hash, expires_at, attempts, used_at FROM node_email_otps WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [normalizedEmail, purpose]
    );
    const otp = rows[0];
    if (!otp) {
      await connection.commit();
      return { ok: false, code: "OTP_INVALID" };
    }
    if (Number(otp.attempts) >= maxAttempts) {
      await connection.commit();
      return { ok: false, code: "OTP_TOO_MANY_ATTEMPTS" };
    }
    if (otp.used_at) {
      await connection.commit();
      return { ok: false, code: "OTP_INVALID" };
    }
    if (new Date(otp.expires_at).getTime() <= Date.now()) {
      await connection.execute("UPDATE node_email_otps SET used_at = NOW() WHERE id = ?", [otp.id]);
      await connection.commit();
      return { ok: false, code: "OTP_EXPIRED" };
    }
    if (!matchesOtp(code, otp.code_hash)) {
      const [update] = await connection.execute("UPDATE node_email_otps SET attempts = attempts + 1 WHERE id = ?", [otp.id]);
      const attempts = Number(otp.attempts) + Number(update.affectedRows > 0);
      if (attempts >= maxAttempts) {
        await connection.execute("UPDATE node_email_otps SET used_at = NOW() WHERE id = ?", [otp.id]);
        await connection.commit();
        return { ok: false, code: "OTP_TOO_MANY_ATTEMPTS" };
      }
      await connection.commit();
      return { ok: false, code: "OTP_INVALID" };
    }

    await connection.execute("UPDATE node_email_otps SET used_at = NOW() WHERE id = ?", [otp.id]);
    if (purpose === "reset_password") {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
      await connection.execute(
        `INSERT INTO node_password_reset_tokens (token_hash, email, user_id, expires_at, created_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ${expiryMinutes} MINUTE), NOW())`,
        [tokenHash, normalizedEmail, otp.user_id]
      );
      await connection.commit();
      return { ok: true, resetToken, userId: otp.user_id };
    }
    await connection.commit();
    return { ok: true, userId: otp.user_id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function verifyEmailAddress(userId) {
  await pool.execute("UPDATE users SET email_verified = 1 WHERE id = ?", [userId]);
  const [rows] = await pool.execute(
    "SELECT email FROM users WHERE id = ?",
    [userId]
  );
  if (!rows[0]) return null;
  const user = await findUserByEmail(rows[0].email);
  return user;
}

export async function useResetToken(email, token, newPassword) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  const normalizedEmail = String(email).trim().toLowerCase();
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      "SELECT user_id, token_hash FROM node_password_reset_tokens WHERE email = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1 FOR UPDATE",
      [normalizedEmail, tokenHash]
    );
    const record = rows[0];
    if (!record || !crypto.timingSafeEqual(Buffer.from(record.token_hash), Buffer.from(tokenHash))) {
      await connection.rollback();
      return false;
    }
    await connection.execute("UPDATE node_password_reset_tokens SET used_at = NOW() WHERE token_hash = ?", [tokenHash]);
    await connection.execute(
      "UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?",
      [hashPassword(newPassword), record.user_id]
    );
    await connection.execute("DELETE FROM sessions WHERE user_id = ?", [record.user_id]);
    await connection.execute(
      "UPDATE node_password_reset_tokens SET used_at = COALESCE(used_at, NOW()) WHERE user_id = ? AND used_at IS NULL",
      [record.user_id]
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
