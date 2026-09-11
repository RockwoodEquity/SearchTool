import { NextRequest, NextResponse } from "next/server";
import { getExaClient } from "@/lib/exa";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("id");
  if (!runId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const exa = getExaClient();
    const run = await exa.agent.runs.get(runId);

    return NextResponse.json({
      status: run.status,
      error: run.error ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get agent run status" },
      { status: 500 }
    );
  }
}
