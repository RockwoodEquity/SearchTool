// Sends email through Resend's HTTP API. Configure with RESEND_API_KEY and MAIL_FROM
// (an address on a domain verified in Resend). RESEND_API_URL exists only so tests can point at a local server.

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/** Base URL for links in emails. Fixed by configuration so a forged Host header can never redirect a reset link. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!res.ok) {
    console.error("Email send failed:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}
