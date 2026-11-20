function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export async function sendOtpEmail({ to, code, purpose }) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "AquaTracker";
  if (!apiKey || !senderEmail) {
    console.error("Brevo OTP email not sent: missing server configuration.");
    throw new Error("OTP email could not be sent.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !/^\d{6}$/.test(code) || !["verify_email", "reset_password"].includes(purpose)) {
    console.error("Brevo OTP email not sent: invalid mail parameters.");
    throw new Error("OTP email could not be sent.");
  }

  const expiryValue = Number.parseInt(process.env.OTP_EXPIRY_MINUTES || "", 10);
  const expiryMinutes = Number.isInteger(expiryValue) && expiryValue > 0 ? Math.min(expiryValue, 60) : 10;
  const title = purpose === "verify_email" ? "Verify your email" : "Reset your password";
  const action = purpose === "verify_email" ? "verify your AquaTracker email address" : "reset your AquaTracker password";
  const safeCode = escapeHtml(code);
  const subject = purpose === "verify_email" ? `Your verification code: ${safeCode}` : `Your password reset code: ${safeCode}`;
  const textContent = `Your AquaTracker ${purpose === "verify_email" ? "verification" : "password reset"} code is ${safeCode}. It expires in ${expiryMinutes} minutes. If you didn't request this, ignore this email.`;
  const htmlContent = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f7;color:#18343b;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f1f5f7"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;border-collapse:separate;background:#fff;border-radius:14px">
<tr><td style="padding:36px 32px 12px;text-align:center"><h1 style="margin:0;color:#087f8c;font-size:26px;line-height:1.3">${title}</h1></td></tr>
<tr><td style="padding:8px 32px 0;text-align:center;font-size:16px;line-height:1.6;color:#40565c">
<p style="margin:0 0 20px">Use this one-time code to ${action}:</p>
<p aria-label="One-time code" style="display:inline-block;margin:0;padding:12px 24px;border-radius:10px;background:#effaf5;color:#073b4c;font-size:36px;font-weight:700;letter-spacing:10px;line-height:1.3">${safeCode}</p>
<p style="margin:22px 0 8px">This code expires in <strong>${expiryMinutes} minutes</strong>.</p>
<p style="margin:0;color:#71858a;font-size:13px">If you didn't request this, ignore this email.</p>
</td></tr><tr><td style="padding:28px 20px 24px;text-align:center;color:#71858a;font-size:12px">AquaTracker</td></tr>
</table></td></tr></table></body></html>`;

  let response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent,
        textContent,
      }),
    });
  } catch {
    console.error("Brevo OTP email failed: transport error; response body suppressed.");
    throw new Error("OTP email could not be sent.");
  }

  if (!response.ok) {
    const category = response.status === 401
      ? "invalid API key"
      : response.status === 403
        ? "sender verification or permission error"
        : response.status === 402 || response.status === 429
          ? "rate limit or daily quota"
          : "provider error";
    console.error(`Brevo OTP email failed: HTTP status=${response.status}; category=${category}; response body suppressed.`);
    throw new Error("OTP email could not be sent.");
  }
}
