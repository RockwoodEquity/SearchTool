import { NextRequest, NextResponse } from "next/server";
import { getExaClient } from "@/lib/exa";
import { insertCompanies, type CompanyInsert } from "@/lib/db";
import { formatFilterLabel, isSearchType, sanitizeFilters, sectorLabel, type Mode } from "@/lib/sectors";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ForSaleCompany {
  company_name: string;
  website?: string;
  listing_url?: string;
  location?: string;
  employees?: string;
  asking_price?: string;
  revenue_or_ebitda?: string;
  broker_source?: string;
  listing_date?: string;
  why_it_fits?: string;
}

interface ProprietaryCompany {
  company_name: string;
  website?: string;
  location?: string;
  employees?: string;
  estimated_revenue?: string;
  currently_for_sale?: string;
  contact?: string;
  pe_owned?: string;
  why_it_fits?: string;
}

function nullIfEmpty(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v.trim() : null;
}

interface GroundingCitation {
  url: string;
  title?: string | null;
}

interface GroundingEntry {
  field: string;
  citations: GroundingCitation[];
}

/** Best source URL for a given company index — the page(s) the agent actually cited. */
function sourceUrlForIndex(
  grounding: GroundingEntry[] | null | undefined,
  index: number,
  fieldNames: string[]
): string | null {
  if (!grounding) return null;
  for (const field of fieldNames) {
    const path = `structured.companies[${index}].${field}`;
    const entry = grounding.find((g) => g.field === path);
    const url = entry?.citations?.[0]?.url;
    if (url) return url;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { runId, searchType, mode, sectorKey, filters } = (await req.json()) as {
    runId: string;
    searchType: unknown;
    mode: Mode;
    sectorKey: string;
    filters?: unknown;
  };

  if (!runId || !mode || !sectorKey || !isSearchType(searchType)) {
    return NextResponse.json({ error: "Missing runId, searchType, mode, or sectorKey" }, { status: 400 });
  }

  try {
    const exa = getExaClient();
    const run = await exa.agent.runs.get(runId);

    if (run.status !== "completed") {
      return NextResponse.json(
        { error: `Run is not completed (status: ${run.status})` },
        { status: 400 }
      );
    }

    const categoryLabel = sectorLabel(sectorKey);
    const searchFilters = formatFilterLabel(sanitizeFilters(filters));
    const structured = run.output?.structured as { companies?: unknown[] } | undefined;
    const companies = Array.isArray(structured?.companies) ? structured!.companies : [];
    const grounding = (run.output?.grounding ?? null) as GroundingEntry[] | null;

    const rows: CompanyInsert[] = companies.map((raw, index) => {
      if (mode === "for_sale") {
        const c = raw as ForSaleCompany;
        const rawDate = nullIfEmpty(c.listing_date);
        const listingDate = rawDate ? rawDate.slice(0, 10) : null;
        const revenueOrPrice = [
          c.asking_price ? `Asking: ${c.asking_price}` : null,
          c.revenue_or_ebitda ? `Rev/EBITDA: ${c.revenue_or_ebitda}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || null;

        const sourceUrl =
          nullIfEmpty(c.listing_url) ??
          sourceUrlForIndex(grounding, index, ["listing_url", "website", "company_name"]) ??
          nullIfEmpty(c.website);

        return {
          mode,
          category: categoryLabel,
          company: c.company_name,
          website: nullIfEmpty(c.website),
          link_to_listing: sourceUrl,
          location: nullIfEmpty(c.location),
          employees: nullIfEmpty(c.employees),
          revenue_or_price: revenueOrPrice,
          why_fits: nullIfEmpty(c.why_it_fits),
          broker_source: nullIfEmpty(c.broker_source),
          listing_date: listingDate,
          contact: null,
          pe_owned: null,
          search_filters: searchFilters,
          search_type: searchType,
        } satisfies CompanyInsert;
      }

      const c = raw as ProprietaryCompany;
      const sourceUrl =
        sourceUrlForIndex(grounding, index, ["company_name", "website", "why_it_fits"]) ??
        nullIfEmpty(c.website);

      return {
        mode,
        category: categoryLabel,
        company: c.company_name,
        website: nullIfEmpty(c.website),
        link_to_listing: sourceUrl,
        location: nullIfEmpty(c.location),
        employees: nullIfEmpty(c.employees),
        revenue_or_price: nullIfEmpty(c.estimated_revenue),
        why_fits: nullIfEmpty(c.why_it_fits),
        broker_source: nullIfEmpty(c.currently_for_sale),
        listing_date: null,
        contact: nullIfEmpty(c.contact),
        pe_owned: nullIfEmpty(c.pe_owned),
        search_filters: searchFilters,
        search_type: searchType,
      } satisfies CompanyInsert;
    });

    const inserted = await insertCompanies(rows);

    return NextResponse.json({ inserted, skipped: rows.length - inserted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to collect agent run results" },
      { status: 500 }
    );
  }
}
