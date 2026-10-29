import { NextRequest, NextResponse } from "next/server";
import { reviewCompany } from "@/lib/db";
import { isReasonCode, isReviewAction } from "@/lib/feedback";

export const runtime = "nodejs";

const MAX_NOTE_LENGTH = 500;

// Keep, pass or restore one result. Passing and restoring also apply to the same company in other modes.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    reasons?: unknown;
    note?: unknown;
  } | null;
  if (!body || !isReviewAction(body.action)) {
    return NextResponse.json({ error: "action must be keep, pass or restore" }, { status: 400 });
  }

  const reasons = Array.isArray(body.reasons) ? body.reasons : [];
  if (!reasons.every(isReasonCode)) {
    return NextResponse.json({ error: "Unknown pass reason" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, MAX_NOTE_LENGTH) : null;

  try {
    const row = await reviewCompany(id, { action: body.action, reasons, note });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save review" },
      { status: 500 }
    );
  }
}
