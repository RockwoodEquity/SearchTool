import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

// The link to the Google Sheet copy of the Master Database. It is handed out only to signed-in users, so
// it never appears in the public pages or scripts of the site. Set SHEET_URL in Vercel to turn it on.
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const url = process.env.SHEET_URL ?? "";
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(url)) {
    return NextResponse.json({ url: null, embedUrl: null });
  }
  const id = /\/d\/([\w-]+)/.exec(url)![1];
  return NextResponse.json({
    url: `https://docs.google.com/spreadsheets/d/${id}/edit`,
    embedUrl: `https://docs.google.com/spreadsheets/d/${id}/edit?rm=minimal`,
  });
}
