import { NextRequest, NextResponse } from "next/server";
import { requireUser, startSession } from "@/lib/auth";
import { getUserById, setUserPassword } from "@/lib/db";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

// Changing a password signs out every other session; the current one is renewed.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => null)) as { current?: unknown; password?: unknown; confirm?: unknown } | null;
  if (!body || typeof body.current !== "string" || typeof body.password !== "string" || typeof body.confirm !== "string") {
    return NextResponse.json({ error: "Fill in all three fields." }, { status: 400 });
  }
  if (body.password !== body.confirm) {
    return NextResponse.json({ error: "The two new passwords do not match." }, { status: 400 });
  }

  try {
    const user = await getUserById(auth.user.id);
    if (!user || !(await verifyPassword(body.current, user.password_hash))) {
      return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });
    }
    const weak = checkPasswordStrength(body.password, user.email);
    if (weak) return NextResponse.json({ error: weak }, { status: 400 });

    const updated = await setUserPassword(user.id, await hashPassword(body.password));
    return startSession(NextResponse.json({ ok: true }), updated.id, updated.password_version);
  } catch (err) {
    console.error("Password change failed:", err);
    return NextResponse.json({ error: "Could not change the password right now. Please try again." }, { status: 500 });
  }
}
