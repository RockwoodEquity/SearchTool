import { NextRequest, NextResponse } from "next/server";
import { deleteCompaniesOfType, queryCompanies } from "@/lib/db";
import { isSearchType } from "@/lib/sectors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "addon";
  const start = req.nextUrl.searchParams.get("start") || undefined;
  const end = req.nextUrl.searchParams.get("end") || undefined;

  if (!isSearchType(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  try {
    const rows = await queryCompanies(type, start, end);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to query companies" },
      { status: 500 }
    );
  }
}

// The type is required (no default) so a bare DELETE can never wipe anything.
export async function DELETE(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  if (!isSearchType(type)) {
    return NextResponse.json({ error: "A valid type (addon or platform) is required" }, { status: 400 });
  }

  try {
    await deleteCompaniesOfType(type);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reset companies" },
      { status: 500 }
    );
  }
}
