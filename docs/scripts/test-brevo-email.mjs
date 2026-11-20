const apiKey = process.env.BREVO_API_KEY?.trim();
const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
const recipientEmail = process.argv[2];

if (!apiKey || !senderEmail) {
  console.error("Set BREVO_API_KEY and BREVO_SENDER_EMAIL in this process environment.");
  process.exit(1);
}

if (!recipientEmail) {
  console.error("Usage: node scripts/test-brevo-email.mjs recipient@example.com");
  process.exit(1);
}

try {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "AquaTracker diagnostic", email: senderEmail },
      to: [{ email: recipientEmail }],
      subject: "AquaTracker Brevo diagnostic",
      textContent: "This is a test email from the AquaTracker Brevo diagnostic script.",
    }),
  });
  const responseBody = await response.text();

  console.log(`HTTP status: ${response.status} ${response.statusText}`);
  console.log("Raw response body:");
  console.log(responseBody);

  if (!response.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Brevo request failed before an HTTP response was received:", error);
  process.exitCode = 1;
}
