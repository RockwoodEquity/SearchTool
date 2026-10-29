import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteOwnCompanies, queryCompanies } from "@/lib/db";
import { isSearchType } from "@/lib/sectors";

export const runtime = "nodejs";

// view=mine (default): only companies your searches found. view=master: everyone's, read-only.
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const type = req.nextUrl.searchParams.get("type") ?? "addon";
  const view = req.nextUrl.searchParams.get("view") ?? "mine";
  const start = req.nextUrl.searchParams.get("start") || undefined;
  const end = req.nextUrl.searchParams.get("end") || undefined;

  if (!isSearchType(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (view !== "mine" && view !== "master") {
    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  }

  try {
    const rows = await queryCompanies(type, start, end, view === "mine" ? { ownerId: auth.user.id } : {});
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to query companies" },
      { status: 500 }
    );
  }
}

// Reset clears only YOUR results in one tab. Passed companies stay remembered, and nobody else's rows are touched.
// The type is required (no default) so a bare DELETE can never remove anything.
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const type = req.nextUrl.searchParams.get("type");
  if (!isSearchType(type)) {
    return NextResponse.json({ error: "A valid type (addon or platform) is required" }, { status: 400 });
  }

  try {
    const removed = await deleteOwnCompanies(type, auth.user.id);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reset companies" },
      { status: 500 }
    );
  }
}
