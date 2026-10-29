import type { Learning, LearningExample } from "./feedback";

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
  unified_aftermarket: {
    label: "Aggregates, Mining & Bulk Material Processing: Aftermarket Products & Services",
    description:
      "Aftermarket products and services companies in the US and Canada that supply and service the crushing, screening and conveying equipment used at aggregate quarries, sand and gravel pits, mines, and recycling and bulk-material-handling plants. " +
      "Products: wear parts and consumables for crushing, screening and conveying equipment, including screen media (woven wire cloth, polyurethane, rubber and plate/perforated), crusher wear parts and liners (jaw plates, cone and gyratory mantles and concaves, impact crusher blow bars), abrasion-resistant liners and wear products (rubber and ceramic liners, wear plate), and conveyor belting and components (belts, idlers, pulleys, belt cleaners, skirting). Also aftermarket parts distribution for aggregates, mining, sand and gravel, and recycling customers. " +
      "Services: rebuild, repair and field service of crushers, screens and conveyors; conveyor belt installation, splicing and repair (including vulcanizing); hardfacing and wear-resistant welding; and plant maintenance services for quarries, pits and mines. " +
      "Vocabulary that identifies these companies: aggregate, quarry, sand and gravel, mining supply, bulk material handling, wire cloth, screen media, crusher parts, wear parts, conveyor belting, industrial rubber products.",
    criteria: [
      "Makes, distributes, installs or services at least one of: screen media (wire cloth, polyurethane, rubber, plate), crusher wear parts and liners, abrasion-resistant liners and wear products, conveyor belting and components, or aftermarket parts for crushing, screening and conveying equipment",
      "Or provides at least one of these services: crusher, screen or conveyor rebuild, repair or field service; conveyor belt installation, splicing or repair; hardfacing or wear-resistant welding; or plant maintenance for quarries, pits and mines",
      "Customers are aggregate, quarry, sand and gravel, mining or recycling operations, with repeat or consumable (replacement) revenue rather than one-time equipment sales",
      "Primarily an aftermarket parts and service business, not a manufacturer of new crushers, screens or conveyors, and not itself a quarry, mine or aggregate producer",
      "Specific to crushing, screening and conveying equipment and their wear parts. Exclude general heavy-equipment or earth-moving equipment repair, dealers whose main business is selling new or used machines (crushers, screeners, loaders, excavators), and general industrial supply houses with no aggregates or mining focus",
      "Not Unified Screening & Crushing (Gilbert, Arizona). This search is run on behalf of that company to find add-ons for it, so exclude it and anything operating under its name",
      "Based in the US or Canada",
      "Independently owned. Exclude any company that is a subsidiary, division or brand of a larger group, including large aggregates and mining producers (for example Vulcan Materials, Martin Marietta, Heidelberg Materials, Cemex) and large equipment makers and parts groups (for example Sandvik, Metso, Weir, FLSmidth, Terex, Caterpillar), and companies backed by private equity",
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
  specialty_medical: {
    label: "Specialty Medical Equipment, Manufacturing & Services",
    description:
      "Specialty medical products and services businesses in three subsectors. " +
      "(1) Specialized medical equipment with consumables and service: manufacturers of machinery and automation used by medical device and laboratory customers, where the equipment addresses a specific process step in a production facility and is validated into that process — for example catheter manufacturing equipment, heat sealers, vision systems, assembly automation, and labeling/serialization systems (comparable companies/deals: SYNEO, Accu-Seal, Parks Medical Electronics). " +
      "(2) Medical contract manufacturing: specialized contract manufacturers focused on medical device production in niche applications, not full-service outsourcing — for example sterilization, FDA/regulatory documentation, mold design/tooling, kitting, and cleanroom contract manufacturing (comparable companies/deals: MRPC, Prince Sterilization Services, Assem-Pak/Aluseal, Octex Group — an ISO 13485-certified contract manufacturer of complex components and assemblies). " +
      "(3) Home medical equipment & services: companies that rent, sell, or lease medical equipment designed for use in the home, for patients directly, insurance, or home health facilities, where local technicians physically go into the home to deliver, install, or repair/service the equipment — for example accessibility equipment (stairlifts, ramps, scooters, lift equipment), positioning equipment (specialized mattresses, lift systems), respiratory equipment (CPAP/BiPAP), incontinence products/services, and OT therapy services (comparable companies/deals: Lifeway Mobility, Star Pediatric Home Care).",
    criteria: [
      "Headquartered in the US",
      PLATFORM_OWNERSHIP,
      "At least 20 employees",
      "Favor niche, mission-critical applications with recurring consumables or service revenue",
      "Favor diversified customer/program exposure; where there is customer or program concentration, it should be reasonable in light of qualification requirements, program duration, switching costs, and sole/dual-source status",
      "The equipment, process, or facility is part of an FDA qualification or validation process",
    ],
  },
  field_services: {
    label: "Field Services Search",
    description:
      "Occupational health, industrial hygiene, environmental testing, and safety training and certification services in three subsectors. " +
      "(1) Occupational health services: mobile medical surveillance and testing — technicians and mobile units that work on employer sites to deliver OSHA/MSHA-required medical surveillance such as hearing, vision, and drug testing, with revenue paid by employers (not third-party payors) and driven by regulation; and DOT compliance testing providers that manage DOT-mandated drug/alcohol testing and driver qualification files (comparable companies/deals: Examinetics, U.S. Mobile Health Exams). " +
      "(2) Industrial hygiene and environmental testing: industrial hygiene and field-based EHS consulting performing on-site exposure monitoring (lead, benzene, hexavalent chromium, noise, asbestos), air quality, and other field sampling; and emissions testing — stack testing, CEMS certification, Title V compliance testing, and ambient air monitoring performed by QSTI-credentialed field crews with mobile testing equipment (comparable companies/deals: ALL4, AirKinetics/Montrose Environmental Group). " +
      "(3) Safety training and certification: equipment/operator certification such as crane operator, forklift, aerial lift, and fall protection competency evaluations delivered by qualified evaluators; and emergency response training such as hazardous waste operations and emergency response training (comparable companies/deals: SMART Safety, Fleet Team, Southeast Lineman Training Center).",
    criteria: [
      PLATFORM_GEOGRAPHY,
      PLATFORM_OWNERSHIP,
      "Revenue is driven by regulatory or compliance requirements (OSHA/MSHA, DOT, EPA/Title V, or similar certification/testing mandates), not discretionary spend",
    ],
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
  "unified_aftermarket",
] as const;

export const PLATFORM_SECTOR_ORDER = [
  "platform_industrials",
  "platform_specialized_b2b",
  "platform_regulated",
  "platform_aerospace_defense",
  "platform_environmental",
  "platform_healthcare",
  "specialty_medical",
  "field_services",
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

/** Every focus area is searched twice per click, with different strategies, to widen coverage. */
export const SEARCH_PASSES = [1, 2] as const;
export type SearchPass = (typeof SEARCH_PASSES)[number];

export function isSearchPass(v: unknown): v is SearchPass {
  return v === 1 || v === 2;
}

function passStrategyBlock(mode: Mode, pass: SearchPass): string[] {
  if (pass === 1) return [];
  if (mode === "for_sale") {
    return [
      "",
      "SEARCH STRATEGY FOR THIS PASS: a first pass has already covered the largest, best-known marketplaces. Do not stop at the first page of results. Look specifically in places that pass would have missed: niche and industry-specific business brokers, M&A advisor and investment-banker \"current opportunities\" pages, regional broker sites, trade-association and industry-publication classifieds, and smaller marketplaces. Open the individual listing pages and read them to confirm the details. Prefer listings that are current (still active, not expired or sold).",
    ];
  }
  return [
    "",
    "SEARCH STRATEGY FOR THIS PASS: a first pass has already covered the most obvious, highest-ranking companies. Do not stop at the first page of search results or at the best-known names. Look specifically for smaller, regional and lesser-known operators by searching trade-association member directories, trade-show exhibitor lists, state and provincial industry directories, OEM and supplier dealer or distributor locators, industry-publication supplier guides, and local business listings. Open each candidate's own website to confirm what it actually does, where it is based, and who owns it before including it.",
  ];
}

function exampleLine(e: LearningExample): string {
  const site = e.website ? ` (${e.website})` : "";
  const reasons = e.reasons.length > 0 ? ` Passed because: ${e.reasons.join("; ")}.` : "";
  const why = e.why ? ` ${e.why}` : "";
  return `- ${e.company}${site}.${reasons}${why}`.replace(/\s+/g, " ").trim();
}

/** What the team's keep / pass history adds to a search: tab-wide rules plus this focus area's examples. */
function learningBlock(learning?: Learning): string[] {
  if (!learning) return [];
  const lines: string[] = [];
  if (learning.rules.length > 0) {
    lines.push(
      "",
      "FIRM-WIDE PREFERENCES learned from the team's past reviews of results. Apply these strictly:",
      ...learning.rules.map((r) => `- ${r}`)
    );
  }
  if (learning.liked.length > 0) {
    lines.push(
      "",
      "COMPANIES THE TEAM KEPT: examples of good fits for this focus area. Find more companies like these, but do not return these exact companies again:",
      ...learning.liked.map(exampleLine)
    );
  }
  if (learning.passed.length > 0) {
    lines.push(
      "",
      "COMPANIES THE TEAM PASSED ON: examples of bad fits for this focus area. Avoid companies like these, and never return these exact companies:",
      ...learning.passed.map(exampleLine)
    );
  }
  return lines;
}

export function buildAgentRunSpec(
  searchType: SearchType,
  mode: Mode,
  sectorKey: string,
  filters: SearchFilters = {},
  pass: SearchPass = 1,
  learning?: Learning
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
      ...learningBlock(learning),
      ...passStrategyBlock("for_sale", pass),
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
    ...learningBlock(learning),
    ...passStrategyBlock("proprietary", pass),
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
