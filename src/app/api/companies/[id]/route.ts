import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { reviewCompany } from "@/lib/db";
import { isReasonCode, isReviewAction } from "@/lib/feedback";

export const runtime = "nodejs";

const MAX_NOTE_LENGTH = 500;

// Keep, pass or restore one result. You can only decide on companies your own searches found.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

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
    const result = await reviewCompany(id, auth.user, { action: body.action, reasons, note });
    if (!result.ok) {
      return result.reason === "forbidden"
        ? NextResponse.json({ error: "That company was found by someone else. Only they can review it." }, { status: 403 })
        : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save review" },
      { status: 500 }
    );
  }
}
