import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "rs_session";
export const SESSION_DAYS = 14;

export interface SessionPayload {
  /** User id. */
  uid: number;
  /** Password version at sign-in: changing the password invalidates every older session. */
  pwv: number;
  /** Expiry, seconds since epoch. */
  exp: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing or shorter than 32 characters");
  return s;
}

const b64url = (buf: Buffer) => buf.toString("base64url");
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest();

export function createSessionToken(uid: number, pwv: number, now = Date.now()): string {
  const payload: SessionPayload = { uid, pwv, exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64url(sign(body))}`;
}

/** Checks the signature and expiry only. Callers that need to honor password changes also check pwv in the database. */
export function verifySessionToken(token: string | undefined | null, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let expected: Buffer;
  let given: Buffer;
  try {
    expected = sign(body);
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.uid !== "number" || typeof payload.pwv !== "number" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  };
}
