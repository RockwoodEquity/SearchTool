export type Mode = "for_sale" | "proprietary";

interface BaseSector {
  label: string;
  description: string;
  criteria: string[];
}

const BASE_SECTORS: Record<string, BaseSector> = {
  environmental_services: {
    label: "Environmental Services",
    description:
      "Environmental services companies in the US and Canada that provide stormwater management, environmental inspection, remediation, or compliance consulting for construction, energy, and land development projects.",
    criteria: [
      "Provides stormwater BMP install/maintenance, environmental inspection, remediation, land reclamation, or environmental/energy consulting",
      "Helps clients with SWPPP/SWP3, Clean Water Act, or NPDES compliance",
      "Based in the US or Canada",
      "Appears independently owned",
    ],
  },
  facility_services: {
    label: "Facility Services",
    description:
      "Companies in the US and Canada that install, repair, or maintain commercial facility access equipment such as commercial doors, loading docks, security gates, or locks.",
    criteria: [
      "Services commercial doors, overhead/garage doors, loading docks, dock seals/shelters, security gates, or locksmithing/master key systems",
      "Based in the US or Canada",
      "Independently owned",
      "Regional/local scale, not a national chain",
    ],
  },
  utility_services: {
    label: "Utility Services",
    description:
      "Companies in the US and Canada that provide underground utility locating, hydrovac excavation, or damage prevention and inspection services.",
    criteria: [
      "Provides hydrovac, utility locating, subsurface utility engineering (SUE), jetting, video pipe inspection/CCTV, or damage prevention services",
      "Based in the US or Canada",
      "Independently owned",
      "Regional scale",
    ],
  },
  manufacturing: {
    label: "Manufacturing",
    description:
      "Manufacturers in the US and Canada producing protective cases, deep-drawn metal parts, rotational-molded plastics, packaging equipment, sealing equipment, or safety/traffic products.",
    criteria: [
      "Manufactures one of: protective cases, deep-drawn metal fabrication, rotational plastic molding, labels, packaging/package-testing equipment, safety or traffic management products, sealing equipment, thermoform",
      "Based in the US or Canada",
      "Independently owned",
      "Small-to-midsize, not a large multinational",
    ],
  },
  b2b_services: {
    label: "B2B Services",
    description:
      "Office equipment dealers in New York, New Jersey, and Philadelphia selling or servicing copiers, printers, mail equipment, or VOIP systems.",
    criteria: [
      "Sells or services copiers, printers, mail equipment, or VOIP",
      "Based in New York, New Jersey, or greater Philadelphia",
      "Independently owned, not part of a national dealer network",
    ],
  },
};

export type SearchType = "addon" | "platform";

const PLATFORM_GEOGRAPHY = "Headquartered in the US or Canada (North America)";
const PLATFORM_OWNERSHIP =
  "Independently owned: founder-owned, family-owned, or a corporate carve-out — not already backed by private equity or part of a larger group";

// Platform search is intentionally broader than add-ons: geography + sector focus only.
// Financial cutoffs are supplied by the user at search time, never hard-coded here.
Object.assign(BASE_SECTORS, {
  platform_industrials: {
    label: "Industrials",
    description:
      "Industrial businesses: value-added manufacturers of engineered products, components and equipment, industrial distributors, and specialty industrial services or technology businesses.",
    criteria: [PLATFORM_GEOGRAPHY, PLATFORM_OWNERSHIP, "Differentiated products or services serving industrial and commercial customers"],
  },
  platform_specialized_b2b: {
    label: "Specialized B2B",
    description:
      "Specialized business-to-business companies: outsourced business services, testing and inspection, facility and maintenance services, and value-added distribution serving commercial and industrial customers with recurring or repeat revenue.",
    criteria: [PLATFORM_GEOGRAPHY, PLATFORM_OWNERSHIP, "Recurring or repeat customer relationships rather than one-off work"],
  },
  platform_regulated: {
    label: "Regulated Industries",
    description:
      "Businesses whose demand is driven by regulation and compliance: inspection, testing, certification, safety and compliance services, and licensed or regulated product and service providers.",
    criteria: [PLATFORM_GEOGRAPHY, PLATFORM_OWNERSHIP, "Revenue supported by regulatory, licensing or compliance requirements"],
  },
  platform_aerospace_defense: {
    label: "Aerospace & Defense",
    description:
      "Aerospace and defense suppliers: manufacturers of components, assemblies and systems, precision machining and fabrication, and MRO or support services for aerospace, defense and government customers.",
    criteria: [PLATFORM_GEOGRAPHY, PLATFORM_OWNERSHIP, "Serves aerospace, defense or government end markets"],
  },
  platform_environmental: {
    label: "Environmental",
    description:
      "Environmental businesses: water and wastewater products and services, waste and recycling services, remediation, environmental testing, consulting and compliance, and related equipment.",
    criteria: [PLATFORM_GEOGRAPHY, PLATFORM_OWNERSHIP, "Serves environmental, water, waste or resource-management needs"],
  },
  platform_healthcare: {
    label: "Healthcare",
    description:
      "Healthcare businesses: medical and assistive product manufacturers, healthcare products distribution, medical device outsourcing and contract services, and non-clinical healthcare services.",
    criteria: [PLATFORM_GEOGRAPHY, PLATFORM_OWNERSHIP, "Serves healthcare, medical or patient-care end markets"],
  },
});

const PLATFORM_EXCLUSIONS: string[] = [
  "",
  "STRICT EXCLUSIONS for this search:",
  "- Exclude contractors: companies whose revenue comes mainly from bid-based, project-by-project construction, installation or trade contracting work (general contractors, subcontractors, and similar).",
  "- Exclude businesses with heavy commodity risk: companies whose main output is a raw material or commodity, or whose margins swing with commodity input prices (for example metals, resin, lumber, aggregates, fuel, oil and gas, agricultural commodities).",
  "Prefer differentiated products or services, repeat or recurring revenue, and diversified customers.",
];

export const SECTOR_ORDER = [
  "environmental_services",
  "facility_services",
  "utility_services",
  "manufacturing",
  "b2b_services",
] as const;

export const PLATFORM_SECTOR_ORDER = [
  "platform_industrials",
  "platform_specialized_b2b",
  "platform_regulated",
  "platform_aerospace_defense",
  "platform_environmental",
  "platform_healthcare",
] as const;

export function isSearchType(v: unknown): v is SearchType {
  return v === "addon" || v === "platform";
}

export function sectorsFor(searchType: SearchType): readonly string[] {
  return searchType === "platform" ? PLATFORM_SECTOR_ORDER : SECTOR_ORDER;
}

export function sectorLabel(key: string): string {
  return BASE_SECTORS[key]?.label ?? key;
}

const MAX_ITEMS = 20;

function criteriaBlock(criteria: string[]): string {
  return criteria.map((c) => `- ${c}`).join("\n");
}

export interface AgentRunSpec {
  query: string;
  outputSchema: Record<string, unknown>;
}

/** Hard revenue / EBITDA cutoffs in $ millions. Any bound may be omitted. */
export interface SearchFilters {
  minRevenueM?: number;
  maxRevenueM?: number;
  minEbitdaM?: number;
  maxEbitdaM?: number;
}

function cleanBound(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function sanitizeFilters(raw: unknown): SearchFilters {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    minRevenueM: cleanBound(r.minRevenueM),
    maxRevenueM: cleanBound(r.maxRevenueM),
    minEbitdaM: cleanBound(r.minEbitdaM),
    maxEbitdaM: cleanBound(r.maxEbitdaM),
  };
}

function rangeText(label: string, min?: number, max?: number): string | null {
  if (min !== undefined && max !== undefined) return `${label} $${min}M-$${max}M`;
  if (min !== undefined) return `${label} >= $${min}M`;
  if (max !== undefined) return `${label} <= $${max}M`;
  return null;
}

/** Short label of the filters applied to a search, stored on each result row. */
export function formatFilterLabel(filters: SearchFilters): string | null {
  const parts = [
    rangeText("Revenue", filters.minRevenueM, filters.maxRevenueM),
    rangeText("EBITDA", filters.minEbitdaM, filters.maxEbitdaM),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : null;
}

function financialRequirementBlock(filters: SearchFilters): string[] {
  const revenue = rangeText("annual revenue", filters.minRevenueM, filters.maxRevenueM);
  const ebitda = rangeText("annual EBITDA", filters.minEbitdaM, filters.maxEbitdaM);
  if (!revenue && !ebitda) return [];

  const bounds = (min?: number, max?: number) =>
    [min !== undefined ? `at least $${min} million` : null, max !== undefined ? `at most $${max} million` : null]
      .filter(Boolean)
      .join(" and ");

  const lines = [
    "",
    "HARD FINANCIAL CUTOFFS — these are strict pass/fail requirements, not preferences:",
  ];
  if (revenue) lines.push(`- Annual revenue must be ${bounds(filters.minRevenueM, filters.maxRevenueM)}.`);
  if (ebitda) lines.push(`- Annual EBITDA must be ${bounds(filters.minEbitdaM, filters.maxEbitdaM)}.`);
  lines.push(
    "Most private companies do not publish revenue or EBITDA, so use disclosed figures where they exist; otherwise use the best credible estimate (business databases, broker listings, employee count and typical revenue per employee for the industry, typical industry margins for EBITDA). Include a company only if its disclosed or best-estimated figures fall inside these bounds. Exclude any company whose figures or best estimate fall outside them, and exclude any company with no credible basis at all for placing it inside them. Returning fewer than the maximum number of results is fine; never pad the list with companies that fail these cutoffs."
  );
  return lines;
}

export function buildAgentRunSpec(
  searchType: SearchType,
  mode: Mode,
  sectorKey: string,
  filters: SearchFilters = {}
): AgentRunSpec {
  const base = BASE_SECTORS[sectorKey];
  if (!base) throw new Error(`Unknown sector: ${sectorKey}`);
  if (!sectorsFor(searchType).includes(sectorKey)) {
    throw new Error(`Sector ${sectorKey} does not belong to ${searchType} search`);
  }
  const typeBlock = searchType === "platform" ? PLATFORM_EXCLUSIONS : [];
  const financialBlock = financialRequirementBlock(filters);

  if (mode === "for_sale") {
    const query = [
      `Find up to ${MAX_ITEMS} real businesses currently for sale that match this description:`,
      base.description,
      "",
      "A result only counts if it is actively marketed for sale right now — listed on a business-for-sale marketplace (e.g. BizBuySell, Axial, a broker's site) or similar — not merely a company website with no for-sale listing. Also require:",
      criteriaBlock(base.criteria),
      ...typeBlock,
      ...financialBlock,
      "",
      "Return each distinct business only once. For each, include the direct link to the for-sale listing itself (not just the company's own website) whenever one exists.",
    ].join("\n");

    const outputSchema = {
      type: "object",
      properties: {
        companies: {
          type: "array",
          maxItems: MAX_ITEMS,
          items: {
            type: "object",
            properties: {
              company_name: { type: "string" },
              website: { type: "string", format: "uri" },
              listing_url: {
                type: "string",
                format: "uri",
                description: "Direct link to the for-sale listing/broker page",
              },
              location: { type: "string" },
              employees: { type: "string" },
              asking_price: { type: "string", description: "Asking price, if disclosed" },
              revenue_or_ebitda: { type: "string", description: "Revenue or EBITDA, if disclosed" },
              broker_source: { type: "string", description: "Broker or marketplace name" },
              listing_date: {
                type: "string",
                format: "date",
                description: "Date the listing was posted, if disclosed",
              },
              why_it_fits: { type: "string", description: "Why this business matches the criteria" },
            },
            required: ["company_name", "website", "listing_url", "why_it_fits"],
          },
        },
      },
      required: ["companies"],
    };

    return { query, outputSchema };
  }

  const query = [
    `Find up to ${MAX_ITEMS} real companies that match this description:`,
    base.description,
    "",
    "Require:",
    criteriaBlock(base.criteria),
    ...typeBlock,
    ...financialBlock,
    "",
    "These are proprietary acquisition targets, not businesses currently marketed for sale — do not limit results to for-sale listings. Return each distinct company only once.",
  ].join("\n");

  const outputSchema = {
    type: "object",
    properties: {
      companies: {
        type: "array",
        maxItems: MAX_ITEMS,
        items: {
          type: "object",
          properties: {
            company_name: { type: "string" },
            website: { type: "string", format: "uri" },
            location: { type: "string" },
            employees: { type: "string" },
            estimated_revenue: { type: "string", description: "Estimated annual revenue, if discoverable" },
            currently_for_sale: {
              type: "string",
              enum: ["Yes", "No", "Unclear"],
              description: "Is the company currently for sale or listed with a broker?",
            },
            contact: { type: "string", description: "Best public contact — phone or email" },
            pe_owned: {
              type: "string",
              enum: ["Yes", "No", "Unclear"],
              description: "Does the company appear to already be PE-owned or part of an existing platform?",
            },
            why_it_fits: { type: "string", description: "Why this company matches the criteria" },
          },
          required: ["company_name", "website", "why_it_fits"],
        },
      },
    },
    required: ["companies"],
  };

  return { query, outputSchema };
}
