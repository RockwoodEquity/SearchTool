// Shared (client + server) definitions for the keep / pass review system. No server-only imports here.

/** A firm-wide reason becomes a standing rule once it has been used on this many different companies. */
export const RULE_THRESHOLD = 2;

export type ReviewStatus = "new" | "kept" | "passed";
export type ReviewAction = "keep" | "pass" | "restore";

/**
 * firm:  reflects the firm's investment mandate, so it can become a rule for every search in the tab.
 * focus: only meaningful inside one focus area, so it is used as an example there, never as a rule.
 * data:  a data-quality problem (closed, wrong record). Remembered, but never teaches anything.
 */
export type ReasonScope = "firm" | "focus" | "data";

export interface PassReason {
  code: string;
  label: string;
  scope: ReasonScope;
  /** Instruction added to every search in the tab once this reason crosses the threshold. */
  rule?: string;
}

export const PASS_REASONS: PassReason[] = [
  {
    code: "pe_backed",
    label: "PE-backed or owned by a larger group",
    scope: "firm",
    rule: "Exclude companies that are backed by private equity or owned by a larger group, parent company or strategic buyer. Only include independently owned companies.",
  },
  {
    code: "too_big",
    label: "Too big",
    scope: "firm",
    rule: "Exclude companies that are larger than the team wants. They have repeatedly passed on companies that were too big. Prefer smaller founder- or family-run businesses.",
  },
  {
    code: "too_small",
    label: "Too small",
    scope: "firm",
    rule: "Exclude very small companies. They have repeatedly passed on businesses that were too small. Prefer companies with an established, meaningful operation.",
  },
  {
    code: "contractor",
    label: "Contractor / project-based",
    scope: "firm",
    rule: "Exclude contractors and businesses whose revenue comes mainly from project-based or bid-based work.",
  },
  {
    code: "commodity",
    label: "Commodity-driven",
    scope: "firm",
    rule: "Exclude businesses whose results depend mainly on commodity prices or whose output is a raw material.",
  },
  {
    code: "concentration",
    label: "Customer concentration",
    scope: "firm",
    rule: "Exclude businesses that depend heavily on one or a few customers.",
  },
  {
    code: "geography",
    label: "Wrong geography",
    scope: "firm",
    rule: "Exclude companies that are outside the target geography.",
  },
  { code: "wrong_industry", label: "Wrong industry", scope: "focus" },
  { code: "not_a_fit", label: "Not the right type of business", scope: "focus" },
  { code: "other", label: "Other (add a note)", scope: "focus" },
  { code: "bad_data", label: "Closed or bad data", scope: "data" },
];

export const REASON_BY_CODE: Record<string, PassReason> = Object.fromEntries(PASS_REASONS.map((r) => [r.code, r]));

export function isReasonCode(v: unknown): v is string {
  return typeof v === "string" && v in REASON_BY_CODE;
}

export function isReviewAction(v: unknown): v is ReviewAction {
  return v === "keep" || v === "pass" || v === "restore";
}

export const FIRM_REASONS = PASS_REASONS.filter((r) => r.scope === "firm");

export interface RuleStatus {
  code: string;
  label: string;
  rule: string;
  /** How many different passed companies in this tab carry this reason. */
  count: number;
  /** The team can switch a rule off; it then stays off until switched back on. */
  enabled: boolean;
  /** Rule is currently applied to searches: reached the threshold and not switched off. */
  active: boolean;
}

export interface LearningExample {
  company: string;
  website: string | null;
  why: string | null;
  /** Human-readable reasons (passed examples only). */
  reasons: string[];
}

/** Everything the review history adds to one focus area's search. */
export interface Learning {
  rules: string[];
  liked: LearningExample[];
  passed: LearningExample[];
}

export interface Exclusion {
  company_name: string;
  website?: string;
}
