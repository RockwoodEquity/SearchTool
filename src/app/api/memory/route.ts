import { NextRequest, NextResponse } from "next/server";
import { getMemory } from "@/lib/db";
import { isSearchType } from "@/lib/sectors";

export const runtime = "nodejs";

// Everything the Rules & Memory page shows for one tab: rules, passed and kept companies.
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "addon";
  if (!isSearchType(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getMemory(type));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load memory" },
      { status: 500 }
    );
  }
}
