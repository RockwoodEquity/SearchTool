import { NextRequest, NextResponse } from "next/server";
import { getExaClient } from "@/lib/exa";
import { requireUser } from "@/lib/auth";
import { getCriteriaOverrides, getExclusions, getLearning } from "@/lib/db";
import type { Exclusion, Learning } from "@/lib/feedback";
import {
  buildAgentRunSpec,
  isSearchPass,
  isSearchType,
  sanitizeFilters,
  sectorLabel,
  sectorsFor,
  type CriteriaOverrides,
  type Mode,
} from "@/lib/sectors";

export const runtime = "nodejs";
export const maxDuration = 60;

// Exa effort tier: higher researches more deeply and costs more per run.
const EFFORT = "medium";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

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

    // The team's review history. If the database can't be read, the search still runs: passed
    // companies are also blocked at save time, so they can never come back into the table.
    let learning: Learning | undefined;
    let exclusion: Exclusion[] = [];
    try {
      [learning, exclusion] = await Promise.all([
        getLearning(searchType, sectorLabel(sectorKey)),
        getExclusions(searchType),
      ]);
    } catch (err) {
      console.error("Could not load review memory; searching without it:", err);
    }

    // The criteria the team has edited on the Criteria page. Unlike review memory this must not be
    // skipped on error: searching with stale text would silently ignore someone's edits.
    let overrides: CriteriaOverrides;
    try {
      overrides = await getCriteriaOverrides();
    } catch (err) {
      console.error("Could not load saved criteria:", err);
      return NextResponse.json({ error: "Could not load the saved search criteria. Try again." }, { status: 500 });
    }

    const { query, outputSchema } = buildAgentRunSpec(
      searchType,
      mode,
      sectorKey,
      sanitizeFilters(filters),
      pass,
      learning,
      overrides
    );

    const run = await exa.agent.runs.create({
      query,
      outputSchema,
      effort: EFFORT,
      ...(exclusion.length > 0 ? { input: { exclusion: exclusion.map((e) => ({ ...e })) } } : {}),
    });

    return NextResponse.json({ runId: run.id, status: run.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create agent run" },
      { status: 500 }
    );
  }
}
