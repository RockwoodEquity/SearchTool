import { NextRequest, NextResponse } from "next/server";
import { startSession } from "@/lib/auth";
import {
  clearLoginFailures,
  getUserByEmail,
  lockoutMinutesLeft,
  normalizeEmail,
  recordLoginFailure,
  touchLastLogin,
} from "@/lib/db";
import { burnPasswordTime, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

const BAD_LOGIN = "Incorrect email or password.";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  if (!body || typeof body.email !== "string" || typeof body.password !== "string" || !body.email || !body.password) {
    return NextResponse.json({ error: BAD_LOGIN }, { status: 400 });
  }
  const email = normalizeEmail(body.email);

  try {
    const minutes = await lockoutMinutesLeft(email);
    if (minutes > 0) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.` },
        { status: 429 }
      );
    }

    const user = await getUserByEmail(email);
    // Unknown emails take the same time as wrong passwords and get the same message.
    const ok = user ? await verifyPassword(body.password, user.password_hash) : (await burnPasswordTime(body.password), false);
    if (!user || !ok) {
      await recordLoginFailure(email);
      return NextResponse.json({ error: BAD_LOGIN }, { status: 401 });
    }

    await clearLoginFailures(email);
    await touchLastLogin(user.id);
    return startSession(NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } }), user.id, user.password_version);
  } catch (err) {
    console.error("Login failed:", err);
    return NextResponse.json({ error: "Could not sign in right now. Please try again." }, { status: 500 });
  }
}
