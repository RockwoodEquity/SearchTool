import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getUserById } from "./db";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions, verifySessionToken } from "./session";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

/** The signed-in user, or null. Checks the cookie signature and that the password has not changed since sign-in. */
export async function getSessionUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const payload = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await getUserById(payload.uid);
  if (!user || user.password_version !== payload.pwv) return null;
  return { id: user.id, email: user.email, name: user.name };
}

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * For API routes. Returns the user, or a ready-made 401/403 response. Requests that change data must also
 * come from this site (Origin header), as a second layer of protection on top of the SameSite cookie.
 */
export async function requireUser(req: NextRequest): Promise<{ user: AuthUser } | { error: NextResponse }> {
  if (MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) {
      return { error: NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 }) };
    }
  }
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Please sign in" }, { status: 401 }) };
  return { user };
}

/** Starts a session by setting the cookie on a response. */
export function startSession(res: NextResponse, userId: number, passwordVersion: number): NextResponse {
  res.cookies.set(SESSION_COOKIE, createSessionToken(userId, passwordVersion), sessionCookieOptions());
  return res;
}

export function endSession(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
