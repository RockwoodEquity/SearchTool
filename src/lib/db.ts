import { Pool } from "pg";
import type { Mode, SearchType } from "./sectors";
import {
  FIRM_REASONS,
  REASON_BY_CODE,
  RULE_THRESHOLD,
  type Exclusion,
  type Learning,
  type LearningExample,
  type ReviewAction,
  type ReviewStatus,
  type RuleStatus,
} from "./feedback";

export interface CompanyRow {
  id: number;
  search_type: SearchType;
  mode: Mode;
  category: string;
  company: string;
  website: string | null;
  link_to_listing: string | null;
  location: string | null;
  employees: string | null;
  revenue_or_price: string | null;
  why_fits: string | null;
  broker_source: string | null;
  listing_date: string | null;
  contact: string | null;
  pe_owned: string | null;
  search_filters: string | null;
  date_found: string;
  status: ReviewStatus;
  pass_reasons: string[];
  pass_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface CompanyInsert {
  search_type: SearchType;
  mode: Mode;
  category: string;
  company: string;
  website: string | null;
  link_to_listing: string | null;
  location: string | null;
  employees: string | null;
  revenue_or_price: string | null;
  why_fits: string | null;
  broker_source: string | null;
  listing_date: string | null;
  contact: string | null;
  pe_owned: string | null;
  search_filters: string | null;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL (or POSTGRES_URL) environment variable is not set");
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

let initialized = false;

export async function ensureSchema() {
  if (initialized) return;
  const q = (sql: string) => getPool().query(sql);
  await q(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      mode TEXT NOT NULL,
      category TEXT NOT NULL,
      company TEXT NOT NULL,
      website TEXT,
      link_to_listing TEXT,
      location TEXT,
      employees TEXT,
      revenue_or_price TEXT,
      why_fits TEXT,
      broker_source TEXT,
      listing_date DATE,
      contact TEXT,
      pe_owned TEXT,
      date_found TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS search_filters TEXT`);
  await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS search_type TEXT NOT NULL DEFAULT 'addon'`);
  await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'`);
  await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pass_reasons TEXT[] NOT NULL DEFAULT '{}'`);
  await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pass_note TEXT`);
  await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS decided_by TEXT`);
  await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ`);
  await q(`
    CREATE TABLE IF NOT EXISTS learning_rules (
      search_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      enabled BOOLEAN NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (search_type, reason)
    )
  `);
  // Keep the tables closed to Supabase's public web API; the app connects with the database role directly.
  await q(`ALTER TABLE companies ENABLE ROW LEVEL SECURITY`);
  await q(`ALTER TABLE learning_rules ENABLE ROW LEVEL SECURITY`);
  initialized = true;
}

const SQL_NORM_NAME = (col: string) =>
  `NULLIF(regexp_replace(regexp_replace(lower(${col}), '\\m(inc|llc|ltd|limited|corp|corporation|co|company|lp|llp)\\M', '', 'g'), '[^a-z0-9]+', '', 'g'), '')`;

const SQL_HOST = (col: string) =>
  `NULLIF(regexp_replace(lower(trim(${col})), '^(https?://)?(www\\.)?([^/?#:]+).*$', '\\3'), '')`;

/**
 * A company is the same company if its normalized name matches (ignores case, punctuation and
 * Inc/LLC/Ltd-style suffixes) or its website hostname matches (ignores www, path and query).
 * Only identity is compared, never enrichment fields like pe_owned, which can vary between runs.
 *
 * Passed companies are remembered across both modes: a company passed anywhere in the tab is never
 * saved again. Everything else is only de-duplicated within its own mode.
 */
export async function insertCompanies(rows: CompanyInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureSchema();
  const client = await getPool().connect();
  let inserted = 0;
  try {
    for (const row of rows) {
      const dup = await client.query(
        `SELECT 1 FROM companies
         WHERE search_type = $4
           AND (mode = $1 OR status = 'passed')
           AND (
             ${SQL_NORM_NAME("company")} = ${SQL_NORM_NAME("$2")}
             OR ($3::text IS NOT NULL AND ${SQL_HOST("website")} = ${SQL_HOST("$3")})
           )
         LIMIT 1`,
        [row.mode, row.company, row.website, row.search_type]
      );
      if ((dup.rowCount ?? 0) > 0) continue;

      await client.query(
        `INSERT INTO companies (
          mode, category, company, website, link_to_listing, location,
          employees, revenue_or_price, why_fits, broker_source, listing_date,
          contact, pe_owned, search_filters, search_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          row.mode,
          row.category,
          row.company,
          row.website,
          row.link_to_listing,
          row.location,
          row.employees,
          row.revenue_or_price,
          row.why_fits,
          row.broker_source,
          row.listing_date,
          row.contact,
          row.pe_owned,
          row.search_filters,
          row.search_type,
        ]
      );
      inserted++;
    }
  } finally {
    client.release();
  }
  return inserted;
}

/**
 * Clears a tab's results. Passed companies are the firm's memory, so they are kept unless
 * `forgetPassed` is set. Resetting one tab never touches the other.
 */
export async function deleteCompaniesOfType(
  searchType: SearchType,
  options: { forgetPassed?: boolean } = {}
): Promise<number> {
  await ensureSchema();
  const sql = options.forgetPassed
    ? `DELETE FROM companies WHERE search_type = $1`
    : `DELETE FROM companies WHERE search_type = $1 AND status <> 'passed'`;
  const res = await getPool().query(sql, [searchType]);
  return res.rowCount ?? 0;
}

export async function queryCompanies(
  searchType: SearchType,
  start?: string,
  end?: string,
  options: { includePassed?: boolean } = {}
): Promise<CompanyRow[]> {
  await ensureSchema();
  const { includePassed = true } = options;

  const conditions: string[] = [`search_type = $1`];
  const params: string[] = [searchType];

  if (!includePassed) conditions.push(`status <> 'passed'`);
  if (start) {
    params.push(start);
    conditions.push(`COALESCE(listing_date, date_found::date) >= $${params.length}::date`);
  }
  if (end) {
    params.push(end);
    conditions.push(`COALESCE(listing_date, date_found::date) <= $${params.length}::date`);
  }

  const { rows } = await getPool().query<CompanyRow>(
    `SELECT * FROM companies WHERE ${conditions.join(" AND ")} ORDER BY date_found DESC`,
    params
  );
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Review: keep / pass / restore
// ---------------------------------------------------------------------------------------------

export interface ReviewInput {
  action: ReviewAction;
  reasons?: string[];
  note?: string | null;
  decidedBy?: string | null;
}

/**
 * Applies a decision to one row. Passing and restoring also apply to every other row in the same tab
 * that is the same company (any mode), so "passed" is a fact about the company, not about one listing.
 * Keeping only affects the row itself.
 */
export async function reviewCompany(id: number, input: ReviewInput): Promise<CompanyRow | null> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const status: ReviewStatus = input.action === "keep" ? "kept" : input.action === "pass" ? "passed" : "new";
    const reasons = input.action === "pass" ? (input.reasons ?? []).filter((r) => r in REASON_BY_CODE) : [];
    const note = input.action === "pass" ? (input.note?.trim() || null) : null;
    const decidedAt = input.action === "restore" ? null : new Date().toISOString();
    const decidedBy = input.action === "restore" ? null : (input.decidedBy ?? null);

    const self = await client.query<CompanyRow>(
      `UPDATE companies
         SET status = $2, pass_reasons = $3, pass_note = $4, decided_by = $5, decided_at = $6
       WHERE id = $1
       RETURNING *`,
      [id, status, reasons, note, decidedBy, decidedAt]
    );
    const updated = self.rows[0];
    if (!updated) {
      await client.query("ROLLBACK");
      return null;
    }

    if (input.action === "pass" || input.action === "restore") {
      await client.query(
        `UPDATE companies c
           SET status = $2, pass_reasons = $3, pass_note = $4, decided_by = $5, decided_at = $6
         FROM companies me
         WHERE me.id = $1
           AND c.id <> me.id
           AND c.search_type = me.search_type
           AND (
             (${SQL_NORM_NAME("c.company")} IS NOT NULL AND ${SQL_NORM_NAME("c.company")} = ${SQL_NORM_NAME("me.company")})
             OR (${SQL_HOST("c.website")} IS NOT NULL AND ${SQL_HOST("c.website")} = ${SQL_HOST("me.website")})
           )
           AND ($2 = 'passed' OR c.status = 'passed')`,
        [id, status, reasons, note, decidedBy, decidedAt]
      );
    }

    await client.query("COMMIT");
    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------------------------
// Memory: rules, exclusions and examples that feed back into searches
// ---------------------------------------------------------------------------------------------

/** Firm-wide reasons, how often each has been used, and whether each is currently an active rule. */
export async function getRuleStatuses(searchType: SearchType): Promise<RuleStatus[]> {
  await ensureSchema();
  const counts = await getPool().query<{ code: string; n: number }>(
    `SELECT r.code, count(DISTINCT COALESCE(r.norm, r.id::text))::int AS n
       FROM (
         SELECT id, ${SQL_NORM_NAME("company")} AS norm, unnest(pass_reasons) AS code
         FROM companies
         WHERE search_type = $1 AND status = 'passed'
       ) r
       GROUP BY r.code`,
    [searchType]
  );
  const overrides = await getPool().query<{ reason: string; enabled: boolean }>(
    `SELECT reason, enabled FROM learning_rules WHERE search_type = $1`,
    [searchType]
  );
  const countBy = new Map(counts.rows.map((r) => [r.code, r.n]));
  const enabledBy = new Map(overrides.rows.map((r) => [r.reason, r.enabled]));

  return FIRM_REASONS.map((r) => {
    const count = countBy.get(r.code) ?? 0;
    const enabled = enabledBy.get(r.code) ?? true;
    return {
      code: r.code,
      label: r.label,
      rule: r.rule ?? "",
      count,
      enabled,
      active: enabled && count >= RULE_THRESHOLD,
    };
  });
}

export async function setRuleEnabled(searchType: SearchType, reason: string, enabled: boolean): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO learning_rules (search_type, reason, enabled) VALUES ($1, $2, $3)
     ON CONFLICT (search_type, reason) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    [searchType, reason, enabled]
  );
}

const MAX_EXCLUSIONS = 200;
const MAX_EXAMPLES = 20;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|lp|llp)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Passed companies in the tab (any mode), most recent first, one entry per company, capped. */
export async function getExclusions(searchType: SearchType): Promise<Exclusion[]> {
  await ensureSchema();
  const { rows } = await getPool().query<{ company: string; website: string | null }>(
    `SELECT company, website FROM companies
     WHERE search_type = $1 AND status = 'passed'
     ORDER BY decided_at DESC NULLS LAST, id DESC`,
    [searchType]
  );
  const seen = new Set<string>();
  const out: Exclusion[] = [];
  for (const r of rows) {
    const key = normalizeName(r.company) || r.company.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.website ? { company_name: r.company, website: r.website } : { company_name: r.company });
    if (out.length >= MAX_EXCLUSIONS) break;
  }
  return out;
}

function toExample(
  r: { company: string; website: string | null; why_fits: string | null; pass_reasons?: string[] },
  withReasons: boolean
): LearningExample {
  return {
    company: r.company,
    website: r.website,
    why: r.why_fits ? r.why_fits.slice(0, 180) : null,
    reasons: withReasons ? (r.pass_reasons ?? []).map((c) => REASON_BY_CODE[c]?.label ?? c) : [],
  };
}

/** What the review history adds to one focus area's search: tab-wide rules plus that area's examples. */
export async function getLearning(searchType: SearchType, categoryLabel: string): Promise<Learning> {
  await ensureSchema();
  const rules = (await getRuleStatuses(searchType)).filter((r) => r.active).map((r) => r.rule);

  const fetchExamples = async (status: "kept" | "passed") => {
    const { rows } = await getPool().query<{
      company: string;
      website: string | null;
      why_fits: string | null;
      pass_reasons: string[];
    }>(
      `SELECT company, website, why_fits, pass_reasons FROM companies
       WHERE search_type = $1 AND category = $2 AND status = $3
       ORDER BY decided_at DESC NULLS LAST, id DESC
       LIMIT ${MAX_EXAMPLES}`,
      [searchType, categoryLabel, status]
    );
    return rows.map((r) => toExample(r, status === "passed"));
  };

  return { rules, liked: await fetchExamples("kept"), passed: await fetchExamples("passed") };
}

export interface MemoryView {
  rules: RuleStatus[];
  passed: CompanyRow[];
  kept: CompanyRow[];
  /** Per focus area: how many examples are currently fed into that area's searches. */
  focusAreas: { category: string; kept: number; passed: number }[];
}

export async function getMemory(searchType: SearchType): Promise<MemoryView> {
  await ensureSchema();
  const rules = await getRuleStatuses(searchType);
  const decided = await getPool().query<CompanyRow>(
    `SELECT * FROM companies
     WHERE search_type = $1 AND status IN ('kept', 'passed')
     ORDER BY decided_at DESC NULLS LAST, id DESC`,
    [searchType]
  );

  const passedSeen = new Set<string>();
  const passed: CompanyRow[] = [];
  const kept: CompanyRow[] = [];
  const byFocus = new Map<string, { category: string; kept: number; passed: number }>();

  for (const r of decided.rows) {
    const f = byFocus.get(r.category) ?? { category: r.category, kept: 0, passed: 0 };
    if (r.status === "passed") {
      f.passed++;
      const key = normalizeName(r.company) || r.company.toLowerCase();
      if (!passedSeen.has(key)) {
        passedSeen.add(key);
        passed.push(r);
      }
    } else {
      f.kept++;
      kept.push(r);
    }
    byFocus.set(r.category, f);
  }

  return { rules, passed, kept, focusAreas: [...byFocus.values()].sort((a, b) => a.category.localeCompare(b.category)) };
}
