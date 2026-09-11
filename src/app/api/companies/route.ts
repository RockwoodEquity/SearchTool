import { NextRequest, NextResponse } from "next/server";
import { deleteAllCompanies, queryCompanies } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start") || undefined;
  const end = req.nextUrl.searchParams.get("end") || undefined;

  try {
    const rows = await queryCompanies(start, end);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to query companies" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await deleteAllCompanies();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reset companies" },
      { status: 500 }
    );
  }
}
