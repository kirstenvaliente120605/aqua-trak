export async function sendSystemEmail(toEmail, subject, htmlContent) {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();

    if (!apiKey || !senderEmail) {
        console.error("Brevo email is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL.");
        return false;
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
                sender: { name: "AquaTracker", email: senderEmail },
                to: [{ email: toEmail }],
                subject,
                htmlContent,
            }),
        });
        const responseBody = await response.text();
        let result = null;
        try {
            result = JSON.parse(responseBody);
        } catch {
            // Non-JSON error responses are reported by HTTP status below.
        }

        if (!response.ok) {
            const detail = typeof result?.message === "string"
                ? result.message
                : `Brevo returned HTTP ${response.status}.`;
            console.error("Brevo email request failed:", detail);
            return false;
        }

        console.log("Brevo accepted the email request. Message ID:", result?.messageId || "unavailable");
        return true;
    } catch (error) {
        console.error("Brevo email request failed:", error.message || error);
        return false;
    }
}
