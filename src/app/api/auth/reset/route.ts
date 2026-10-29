import { NextRequest, NextResponse } from "next/server";
import { consumeResetToken, findResetUser, setUserPassword } from "@/lib/db";
import { checkPasswordStrength, hashPassword } from "@/lib/password";

export const runtime = "nodejs";

const BAD_LINK = "This reset link is invalid or has expired. Request a new one.";

// Completes a reset from the emailed link: new password plus confirmation. A link works exactly once.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { token?: unknown; password?: unknown; confirm?: unknown } | null;
  if (!body || typeof body.token !== "string" || typeof body.password !== "string" || typeof body.confirm !== "string") {
    return NextResponse.json({ error: BAD_LINK }, { status: 400 });
  }
  if (body.password !== body.confirm) {
    return NextResponse.json({ error: "The two passwords do not match." }, { status: 400 });
  }

  try {
    const user = await findResetUser(body.token);
    if (!user) return NextResponse.json({ error: BAD_LINK }, { status: 400 });

    const weak = checkPasswordStrength(body.password, user.email);
    if (weak) return NextResponse.json({ error: weak }, { status: 400 });

    // Use the link up first; if two requests race, only one wins.
    if (!(await consumeResetToken(body.token))) return NextResponse.json({ error: BAD_LINK }, { status: 400 });
    await setUserPassword(user.id, await hashPassword(body.password));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Password reset failed:", err);
    return NextResponse.json({ error: "Could not reset the password right now. Please try again." }, { status: 500 });
  }
}
