import { NextRequest, NextResponse } from "next/server";
import { getExaClient } from "@/lib/exa";
import { buildAgentRunSpec, type Mode } from "@/lib/sectors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { mode, sectorKey } = (await req.json()) as { mode: Mode; sectorKey: string };

  if (mode !== "for_sale" && mode !== "proprietary") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  try {
    const exa = getExaClient();
    const { query, outputSchema } = buildAgentRunSpec(mode, sectorKey);

    const run = await exa.agent.runs.create({
      query,
      outputSchema,
      effort: "low",
    });

    return NextResponse.json({ runId: run.id, status: run.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create agent run" },
      { status: 500 }
    );
  }
}
