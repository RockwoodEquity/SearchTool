import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { listSheetRows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TIME_ZONE = "America/New_York";

function keyMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Read by the Google Sheet's script every few minutes. It is not behind the sign-in (a script cannot
// sign in), so it needs the secret key instead: SHEET_FEED_KEY, sent as "Authorization: Bearer <key>".
export async function GET(req: NextRequest) {
  const expected = process.env.SHEET_FEED_KEY;
  if (!expected || expected.length < 32) {
    return NextResponse.json({ error: "The sheet feed is not set up" }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!given || !keyMatches(given, expected)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const timeZone = process.env.SHEET_TIMEZONE || DEFAULT_TIME_ZONE;
    const rows = await listSheetRows(timeZone);
    return NextResponse.json(
      { generatedAt: new Date().toISOString(), timeZone, rows },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not read the database" }, { status: 500 });
  }
}