<?php
/** Brevo transactional email helper. Credentials come from the server environment. */

declare(strict_types=1);

namespace AquaTracker;

/** Send the post-registration greeting to the account owner. */
function sendWelcomeEmail(string $userEmail, string $userName, string $role = 'customer'): void
{
    $apiKey = trim((string) getenv('BREVO_API_KEY'));
    $senderEmail = trim((string) getenv('BREVO_SENDER_EMAIL'));
    if ($apiKey === '' || $senderEmail === '') {
        throw new \RuntimeException('Brevo is not configured in the server environment.');
    }
    if (!filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) {
        throw new \RuntimeException('BREVO_SENDER_EMAIL must be a valid verified sender address.');
    }
    if (!extension_loaded('curl')) {
        throw new \RuntimeException('The PHP cURL extension is required to send email through Brevo.');
    }

    $greetingName = trim($userName) !== '' ? trim($userName) : $userEmail;
    $safeName = htmlspecialchars($greetingName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $safeEmail = htmlspecialchars($userEmail, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $loginRole = in_array($role, ['customer', 'owner', 'staff'], true) ? $role : 'customer';
    $publicUrl = rtrim(trim((string) getenv('AQ_PUBLIC_URL')) ?: 'http://localhost:8080', '/');
    $loginUrl = htmlspecialchars($publicUrl . '/auth/' . rawurlencode($loginRole) . '/login', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $year = date('Y');
    $htmlContent = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <title>Welcome to AquaTracker</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f7; font-family:Arial, Helvetica, sans-serif; color:#18343b;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#f1f5f7; border-collapse:collapse;">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; max-width:600px; background-color:#ffffff; border-radius:12px; border-collapse:separate; overflow:hidden;">
                    <tr>
                        <td align="center" style="padding:36px 32px 0;">
                            <h1 style="margin:0; color:#087f8c; font-size:28px; line-height:1.3; font-weight:700;">Welcome to AquaTracker!</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 36px 8px; font-size:16px; line-height:1.7; color:#40565c;">
                            <p style="margin:0 0 16px;">Hi {$safeName},</p>
                            <p style="margin:0 0 16px;">Your AquaTracker account is ready. Find trusted water stations, manage your orders, and stay on top of your water needs in one place.</p>
                            <p style="margin:0;">Sign in with <strong style="color:#18343b;">{$safeEmail}</strong> to get started.</p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:24px 24px 32px;">
                            <a href="{$loginUrl}" style="display:inline-block; padding:14px 30px; background-color:#087f8c; border:1px solid #087f8c; border-radius:6px; color:#ffffff; font-size:16px; line-height:1.2; font-weight:700; text-decoration:none;">Get Started</a>
                        </td>
                    </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; max-width:600px; border-collapse:collapse;">
                    <tr>
                        <td align="center" style="padding:20px 16px 0; color:#71858a; font-size:12px; line-height:1.5;">
                            <p style="margin:0;">&copy; {$year} AquaTracker. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;

    $payload = json_encode([
        'sender' => ['name' => 'AquaTracker', 'email' => $senderEmail],
        'to' => [['email' => $userEmail, 'name' => $greetingName]],
        'subject' => 'Welcome to AquaTracker!',
        'htmlContent' => $htmlContent,
        'textContent' => "Welcome to AquaTracker, {$greetingName}! Your account is ready. Sign in with {$userEmail} at {$publicUrl}/auth/{$loginRole}/login to get started.",
    ], JSON_THROW_ON_ERROR);

    $curl = curl_init('https://api.brevo.com/v3/smtp/email');
    if ($curl === false) {
        throw new \RuntimeException('Could not initialize the Brevo request.');
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

    $responseBody = curl_exec($curl);
    $curlError = curl_error($curl);
    $statusCode = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    if ($responseBody === false) {
        throw new \RuntimeException('Brevo request failed: ' . ($curlError ?: 'unknown cURL error.'));
    }

    if ($statusCode < 200 || $statusCode >= 300) {
        $response = json_decode($responseBody, true);
        $message = is_array($response) && isset($response['message'])
            ? (string) $response['message']
            : 'Brevo rejected the email request.';
        throw new \RuntimeException("Brevo API returned HTTP {$statusCode}: {$message}");
    }
}
