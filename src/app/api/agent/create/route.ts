import { NextRequest, NextResponse } from "next/server";
import { getExaClient } from "@/lib/exa";
import {
  buildAgentRunSpec,
  isSearchPass,
  isSearchType,
  sanitizeFilters,
  sectorsFor,
  type Mode,
} from "@/lib/sectors";

export const runtime = "nodejs";
export const maxDuration = 60;

// Exa effort tier: higher researches more deeply and costs more per run.
const EFFORT = "medium";

export async function POST(req: NextRequest) {
  const { searchType, mode, sectorKey, filters, pass = 1 } = (await req.json()) as {
    searchType: unknown;
    mode: Mode;
    sectorKey: string;
    filters?: unknown;
    pass?: unknown;
  };

  if (!isSearchPass(pass)) {
    return NextResponse.json({ error: "Invalid pass" }, { status: 400 });
  }

  if (!isSearchType(searchType)) {
    return NextResponse.json({ error: "Invalid searchType" }, { status: 400 });
  }
  if (!sectorsFor(searchType).includes(sectorKey)) {
    return NextResponse.json({ error: "Sector does not belong to this search type" }, { status: 400 });
  }
  if (mode !== "for_sale" && mode !== "proprietary") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  try {
    const exa = getExaClient();
    const { query, outputSchema } = buildAgentRunSpec(searchType, mode, sectorKey, sanitizeFilters(filters), pass);

    const run = await exa.agent.runs.create({
      query,
      outputSchema,
      effort: EFFORT,
    });

    return NextResponse.json({ runId: run.id, status: run.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create agent run" },
      { status: 500 }
    );
  }
}
