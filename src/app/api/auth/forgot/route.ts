import { NextRequest, NextResponse } from "next/server";
import { createResetToken, getUserByEmail, normalizeEmail } from "@/lib/db";
import { appUrl, mailConfigured, sendMail } from "@/lib/mail";

export const runtime = "nodejs";

// Always answers the same way whether or not the email has an account, so it cannot be used to find out who does.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  if (!body || typeof body.email !== "string" || !body.email.includes("@")) {
    return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
  }

  if (!mailConfigured()) {
    return NextResponse.json({ ok: true, emailConfigured: false });
  }

  try {
    const user = await getUserByEmail(normalizeEmail(body.email));
    if (user) {
      const token = await createResetToken(user.id);
      if (token) {
        const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
        await sendMail(
          user.email,
          "Reset your Rockwood Search password",
          `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in 1 hour:\n\n${link}\n\nIf you did not ask for this, you can ignore this email. Your password has not changed.`
        );
      }
    }
  } catch (err) {
    console.error("Password reset request failed:", err);
  }
  return NextResponse.json({ ok: true, emailConfigured: true });
}
