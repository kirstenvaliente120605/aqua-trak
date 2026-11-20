<?php

declare(strict_types=1);

namespace AquaTracker;

/**
 * Sends an OTP using the Brevo transactional email API.
 *
 * @param array{to:string,code:string,purpose:string} $message
 */
function sendOtpEmail(array $message): void
{
    $apiKey = trim((string) getenv('BREVO_API_KEY'));
    $senderEmail = trim((string) getenv('BREVO_SENDER_EMAIL'));
    $senderName = trim((string) getenv('BREVO_SENDER_NAME')) ?: 'AquaTracker';
    if ($apiKey === '' || $senderEmail === '') {
        error_log('Brevo OTP email not sent: missing server configuration.');
        throw new \RuntimeException('OTP email could not be sent.');
    }
    if (!filter_var($senderEmail, FILTER_VALIDATE_EMAIL) || !filter_var($message['to'] ?? '', FILTER_VALIDATE_EMAIL)) {
        error_log('Brevo OTP email not sent: invalid sender or recipient address.');
        throw new \RuntimeException('OTP email could not be sent.');
    }
    if (!extension_loaded('curl')) {
        error_log('Brevo OTP email not sent: PHP cURL extension is unavailable.');
        throw new \RuntimeException('OTP email could not be sent.');
    }

    $purpose = (string) ($message['purpose'] ?? '');
    if (!in_array($purpose, ['verify_email', 'reset_password'], true) || preg_match('/^\d{6}$/', (string) ($message['code'] ?? '')) !== 1) {
        error_log('Brevo OTP email not sent: invalid mail parameters.');
        throw new \RuntimeException('OTP email could not be sent.');
    }

    $configuredExpiry = filter_var(getenv('OTP_EXPIRY_MINUTES'), FILTER_VALIDATE_INT);
    $expiryMinutes = $configuredExpiry !== false && $configuredExpiry > 0
        ? min(60, $configuredExpiry)
        : 10;
    $code = htmlspecialchars((string) $message['code'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $heading = $purpose === 'verify_email' ? 'Verify your email' : 'Reset your password';
    $subject = $purpose === 'verify_email'
        ? 'Your verification code: ' . $code
        : 'Your password reset code: ' . $code;
    $action = $purpose === 'verify_email'
        ? 'verify your AquaTracker email address'
        : 'reset your AquaTracker password';
    $plain = $purpose === 'verify_email'
        ? "Your AquaTracker verification code is {$code}. It expires in {$expiryMinutes} minutes. If you didn't request this, ignore this email."
        : "Your AquaTracker password reset code is {$code}. It expires in {$expiryMinutes} minutes. If you didn't request this, ignore this email.";

    $html = <<<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>{$heading}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f7;color:#18343b;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f1f5f7">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;border-collapse:separate;background:#fff;border-radius:14px">
        <tr><td style="padding:36px 32px 12px;text-align:center">
          <h1 style="margin:0;color:#087f8c;font-size:26px;line-height:1.3">{$heading}</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 0;text-align:center;font-size:16px;line-height:1.6;color:#40565c">
          <p style="margin:0 0 20px">Use this one-time code to {$action}:</p>
          <p aria-label="One-time code" style="display:inline-block;margin:0;padding:12px 24px;border-radius:10px;background:#effaf5;color:#073b4c;font-size:36px;font-weight:700;letter-spacing:10px;line-height:1.3">{$code}</p>
          <p style="margin:22px 0 8px">This code expires in <strong>{$expiryMinutes} minutes</strong>.</p>
          <p style="margin:0;color:#71858a;font-size:13px">If you didn't request this, ignore this email.</p>
        </td></tr>
        <tr><td style="padding:28px 20px 24px;text-align:center;color:#71858a;font-size:12px">AquaTracker</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;

    $payload = json_encode([
        'sender' => ['name' => $senderName, 'email' => $senderEmail],
        'to' => [['email' => (string) $message['to']]],
        'subject' => $subject,
        'htmlContent' => $html,
        'textContent' => $plain,
    ], JSON_THROW_ON_ERROR);

    $curl = curl_init('https://api.brevo.com/v3/smtp/email');
    if ($curl === false) {
        error_log('Brevo OTP email failed: cURL initialization error.');
        throw new \RuntimeException('OTP email could not be sent.');
    }

    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'accept: application/json',
            'api-key: ' . $apiKey,
            'content-type: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
    ]);

    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $transportFailed = $response === false;
    curl_close($curl);

    if ($transportFailed || $status < 200 || $status >= 300) {
        $category = match (true) {
            $transportFailed => 'transport error',
            $status === 401 => 'invalid API key',
            $status === 403 => 'sender verification or permission error',
            $status === 429 => 'rate limit or daily quota',
            $status === 402 => 'daily quota',
            default => 'provider error',
        };
        error_log("Brevo OTP email failed: HTTP status={$status}; category={$category}; response body suppressed.");
        throw new \RuntimeException('OTP email could not be sent.');
    }
}
