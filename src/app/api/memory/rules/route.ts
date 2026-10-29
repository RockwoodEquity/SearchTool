import { NextRequest, NextResponse } from "next/server";
import { setRuleEnabled } from "@/lib/db";
import { FIRM_REASONS } from "@/lib/feedback";
import { isSearchType } from "@/lib/sectors";

export const runtime = "nodejs";

// Switch a firm-wide rule on or off for one tab.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    searchType?: unknown;
    reason?: unknown;
    enabled?: unknown;
  } | null;

  if (
    !body ||
    !isSearchType(body.searchType) ||
    typeof body.enabled !== "boolean" ||
    !FIRM_REASONS.some((r) => r.code === body.reason)
  ) {
    return NextResponse.json({ error: "searchType, a firm-wide reason and enabled are required" }, { status: 400 });
  }

  try {
    await setRuleEnabled(body.searchType, body.reason as string, body.enabled);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update rule" },
      { status: 500 }
    );
  }
}
