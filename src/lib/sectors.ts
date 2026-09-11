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

export const SECTOR_ORDER = [
  "environmental_services",
  "facility_services",
  "utility_services",
  "manufacturing",
  "b2b_services",
] as const;

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

export function buildAgentRunSpec(mode: Mode, sectorKey: string): AgentRunSpec {
  const base = BASE_SECTORS[sectorKey];
  if (!base) throw new Error(`Unknown sector: ${sectorKey}`);

  if (mode === "for_sale") {
    const query = [
      `Find up to ${MAX_ITEMS} real businesses currently for sale that match this description:`,
      base.description,
      "",
      "A result only counts if it is actively marketed for sale right now — listed on a business-for-sale marketplace (e.g. BizBuySell, Axial, a broker's site) or similar — not merely a company website with no for-sale listing. Also require:",
      criteriaBlock(base.criteria),
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
