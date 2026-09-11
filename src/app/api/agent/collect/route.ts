import { NextRequest, NextResponse } from "next/server";
import { getExaClient } from "@/lib/exa";
import { insertCompanies, type CompanyInsert } from "@/lib/db";
import { sectorLabel, type Mode } from "@/lib/sectors";

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

export async function POST(req: NextRequest) {
  const { runId, mode, sectorKey } = (await req.json()) as {
    runId: string;
    mode: Mode;
    sectorKey: string;
  };

  if (!runId || !mode || !sectorKey) {
    return NextResponse.json({ error: "Missing runId, mode, or sectorKey" }, { status: 400 });
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
    const structured = run.output?.structured as { companies?: unknown[] } | undefined;
    const companies = Array.isArray(structured?.companies) ? structured!.companies : [];

    const rows: CompanyInsert[] = companies.map((raw) => {
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

        return {
          mode,
          category: categoryLabel,
          company: c.company_name,
          website: nullIfEmpty(c.website),
          link_to_listing: nullIfEmpty(c.listing_url) ?? nullIfEmpty(c.website),
          location: nullIfEmpty(c.location),
          employees: nullIfEmpty(c.employees),
          revenue_or_price: revenueOrPrice,
          why_fits: nullIfEmpty(c.why_it_fits),
          broker_source: nullIfEmpty(c.broker_source),
          listing_date: listingDate,
          contact: null,
          pe_owned: null,
        } satisfies CompanyInsert;
      }

      const c = raw as ProprietaryCompany;
      return {
        mode,
        category: categoryLabel,
        company: c.company_name,
        website: nullIfEmpty(c.website),
        link_to_listing: null,
        location: nullIfEmpty(c.location),
        employees: nullIfEmpty(c.employees),
        revenue_or_price: nullIfEmpty(c.estimated_revenue),
        why_fits: nullIfEmpty(c.why_it_fits),
        broker_source: nullIfEmpty(c.currently_for_sale),
        listing_date: null,
        contact: nullIfEmpty(c.contact),
        pe_owned: nullIfEmpty(c.pe_owned),
      } satisfies CompanyInsert;
    });

    await insertCompanies(rows);

    return NextResponse.json({ inserted: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to collect agent run results" },
      { status: 500 }
    );
  }
}
