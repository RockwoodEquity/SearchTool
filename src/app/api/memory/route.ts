import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getMemory } from "@/lib/db";
import { isSearchType } from "@/lib/sectors";

export const runtime = "nodejs";

// Everything the Rules & Memory page shows for one tab: rules, passed and kept companies. Shared by everyone.
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

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
