import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { PLATFORM_EXCLUSIONS_KEY, type CriteriaOverrides, type CriteriaSpec, type Mode, type SearchType } from "./sectors";
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
  /** The person whose search found this company. */
  owner_id: number | null;
  owner_name: string | null;
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
  owner_id: number | null;
}

export interface UserRecord {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  password_version: number;
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
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `);
  await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await q(`
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      email TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS criteria_settings (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Keep every table closed to Supabase's public web API; the app connects with the database role directly.
  for (const table of ["companies", "learning_rules", "users", "password_resets", "login_attempts", "criteria_settings"]) {
    await q(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  }
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
 * De-duplication is global within a tab: across both people, both modes and every focus area, so
 * each company appears exactly once, owned by whoever found it first. Passed companies stay in the
 * table as memory, so they are covered by the same check.
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
         WHERE search_type = $3
           AND (
             ${SQL_NORM_NAME("company")} = ${SQL_NORM_NAME("$1")}
             OR ($2::text IS NOT NULL AND ${SQL_HOST("website")} = ${SQL_HOST("$2")})
           )
         LIMIT 1`,
        [row.company, row.website, row.search_type]
      );
      if ((dup.rowCount ?? 0) > 0) continue;

      await client.query(
        `INSERT INTO companies (
          mode, category, company, website, link_to_listing, location,
          employees, revenue_or_price, why_fits, broker_source, listing_date,
          contact, pe_owned, search_filters, search_type, owner_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
          row.owner_id,
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
 * Clears one person's results in a tab. Passed companies are the firm's memory and are kept, and
 * the other person's companies are never touched.
 */
export async function deleteOwnCompanies(searchType: SearchType, ownerId: number): Promise<number> {
  await ensureSchema();
  const res = await getPool().query(
    `DELETE FROM companies WHERE search_type = $1 AND owner_id = $2 AND status <> 'passed'`,
    [searchType, ownerId]
  );
  return res.rowCount ?? 0;
}

export async function queryCompanies(
  searchType: SearchType,
  start?: string,
  end?: string,
  options: { includePassed?: boolean; ownerId?: number } = {}
): Promise<CompanyRow[]> {
  await ensureSchema();
  const { includePassed = true, ownerId } = options;

  const conditions: string[] = [`c.search_type = $1`];
  const params: (string | number)[] = [searchType];

  if (ownerId !== undefined) {
    params.push(ownerId);
    conditions.push(`c.owner_id = $${params.length}`);
  }
  if (!includePassed) conditions.push(`c.status <> 'passed'`);
  if (start) {
    params.push(start);
    conditions.push(`COALESCE(c.listing_date, c.date_found::date) >= $${params.length}::date`);
  }
  if (end) {
    params.push(end);
    conditions.push(`COALESCE(c.listing_date, c.date_found::date) <= $${params.length}::date`);
  }

  const { rows } = await getPool().query<CompanyRow>(
    `SELECT c.*, u.name AS owner_name
       FROM companies c LEFT JOIN users u ON u.id = c.owner_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY c.date_found DESC`,
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
}

export type ReviewResult = { ok: true } | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Applies a decision to one row, and only if the actor sourced it. Passing and restoring also apply to
 * any other row of the same company that the same person owns. Keeping only affects the row itself.
 */
export async function reviewCompany(
  id: number,
  actor: { id: number; email: string },
  input: ReviewInput
): Promise<ReviewResult> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ owner_id: number | null }>(`SELECT owner_id FROM companies WHERE id = $1 FOR UPDATE`, [id]);
    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" };
    }
    if (existing.rows[0].owner_id !== actor.id) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "forbidden" };
    }

    const status: ReviewStatus = input.action === "keep" ? "kept" : input.action === "pass" ? "passed" : "new";
    const reasons = input.action === "pass" ? (input.reasons ?? []).filter((r) => r in REASON_BY_CODE) : [];
    const note = input.action === "pass" ? (input.note?.trim() || null) : null;
    const decidedAt = input.action === "restore" ? null : new Date().toISOString();
    const decidedBy = input.action === "restore" ? null : actor.email;

    await client.query(
      `UPDATE companies
         SET status = $2, pass_reasons = $3, pass_note = $4, decided_by = $5, decided_at = $6
       WHERE id = $1`,
      [id, status, reasons, note, decidedBy, decidedAt]
    );

    if (input.action === "pass" || input.action === "restore") {
      await client.query(
        `UPDATE companies c
           SET status = $2, pass_reasons = $3, pass_note = $4, decided_by = $5, decided_at = $6
         FROM companies me
         WHERE me.id = $1
           AND c.id <> me.id
           AND c.search_type = me.search_type
           AND c.owner_id = me.owner_id
           AND (
             (${SQL_NORM_NAME("c.company")} IS NOT NULL AND ${SQL_NORM_NAME("c.company")} = ${SQL_NORM_NAME("me.company")})
             OR (${SQL_HOST("c.website")} IS NOT NULL AND ${SQL_HOST("c.website")} = ${SQL_HOST("me.website")})
           )
           AND ($2 = 'passed' OR c.status = 'passed')`,
        [id, status, reasons, note, decidedBy, decidedAt]
      );
    }

    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------------------------
// Memory: rules, exclusions and examples that feed back into searches (shared by everyone)
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

const MAX_EXCLUSIONS = 400;
const MAX_EXAMPLES = 20;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|lp|llp)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Every company already in the tab, from both people. Passed companies come first, since they matter
 * most, then everything else newest first; one entry per company, capped.
 */
export async function getExclusions(searchType: SearchType): Promise<Exclusion[]> {
  await ensureSchema();
  const { rows } = await getPool().query<{ company: string; website: string | null }>(
    `SELECT company, website FROM companies
     WHERE search_type = $1
     ORDER BY (status = 'passed') DESC, COALESCE(decided_at, date_found) DESC, id DESC`,
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
    `SELECT c.*, u.name AS owner_name
       FROM companies c LEFT JOIN users u ON u.id = c.owner_id
      WHERE c.search_type = $1 AND c.status IN ('kept', 'passed')
      ORDER BY c.decided_at DESC NULLS LAST, c.id DESC`,
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

// ---------------------------------------------------------------------------------------------
// Accounts, sessions support, password reset, login throttling
// ---------------------------------------------------------------------------------------------

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const USER_COLUMNS = `id, email, name, password_hash, password_version`;

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query<UserRecord>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [normalizeEmail(email)]);
  return rows[0] ?? null;
}

export async function getUserById(id: number): Promise<UserRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query<UserRecord>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createUser(email: string, name: string, passwordHash: string): Promise<UserRecord> {
  await ensureSchema();
  const { rows } = await getPool().query<UserRecord>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
    [normalizeEmail(email), name.trim(), passwordHash]
  );
  return rows[0];
}

/** Sets a new password, bumps the version so every older session stops working, and voids pending reset links. */
export async function setUserPassword(userId: number, passwordHash: string): Promise<UserRecord> {
  await ensureSchema();
  const { rows } = await getPool().query<UserRecord>(
    `UPDATE users SET password_hash = $2, password_version = password_version + 1 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [userId, passwordHash]
  );
  await getPool().query(`UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  await getPool().query(`DELETE FROM login_attempts WHERE email = $1`, [rows[0]?.email ?? ""]);
  return rows[0];
}

export async function touchLastLogin(userId: number): Promise<void> {
  await getPool().query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
}

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/** Minutes left on a lockout, or 0. */
export async function lockoutMinutesLeft(email: string): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().query<{ left: number | null }>(
    `SELECT CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())) / 60)::int AS left FROM login_attempts WHERE email = $1 AND locked_until > NOW()`,
    [normalizeEmail(email)]
  );
  return rows[0]?.left ?? 0;
}

export async function recordLoginFailure(email: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO login_attempts (email, failures) VALUES ($1, 1)
     ON CONFLICT (email) DO UPDATE SET
       failures = CASE WHEN login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= NOW() THEN 1 ELSE login_attempts.failures + 1 END,
       locked_until = CASE
         WHEN (CASE WHEN login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= NOW() THEN 1 ELSE login_attempts.failures + 1 END) >= ${MAX_FAILURES}
           THEN NOW() + INTERVAL '${LOCK_MINUTES} minutes'
         ELSE NULL END,
       updated_at = NOW()`,
    [normalizeEmail(email)]
  );
}

export async function clearLoginFailures(email: string): Promise<void> {
  await getPool().query(`DELETE FROM login_attempts WHERE email = $1`, [normalizeEmail(email)]);
}

const RESET_HOURS = 1;
const MAX_RESETS_PER_HOUR = 3;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Creates a single-use reset link token (valid one hour). Returns null if too many were requested recently. */
export async function createResetToken(userId: number): Promise<string | null> {
  await ensureSchema();
  const recent = await getPool().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId]
  );
  if (recent.rows[0].n >= MAX_RESETS_PER_HOUR) return null;
  const token = randomBytes(32).toString("base64url");
  await getPool().query(
    `INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${RESET_HOURS} hour')`,
    [sha256(token), userId]
  );
  return token;
}

/** The user a valid, unused, unexpired token belongs to, without using it up. */
export async function findResetUser(token: string): Promise<UserRecord | null> {
  await ensureSchema();
  const { rows } = await getPool().query<UserRecord>(
    `SELECT u.id, u.email, u.name, u.password_hash, u.password_version
       FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > NOW()`,
    [sha256(token)]
  );
  return rows[0] ?? null;
}

/** Marks a token used. Returns false if it was already used or expired, so a link works exactly once. */
export async function consumeResetToken(token: string): Promise<boolean> {
  await ensureSchema();
  const res = await getPool().query(
    `UPDATE password_resets SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [sha256(token)]
  );
  return (res.rowCount ?? 0) > 0;
}

// ---- Editable search criteria (shared by everyone, saved from the Criteria page) ----

export interface CriteriaRecord {
  key: string;
  data: unknown;
  updated_by: string;
  updated_at: string;
}

export async function listCriteriaRecords(): Promise<CriteriaRecord[]> {
  await ensureSchema();
  const { rows } = await getPool().query<{ key: string; data: unknown; updated_by: string; updated_at: Date }>(
    `SELECT key, data, updated_by, updated_at FROM criteria_settings`
  );
  return rows.map((r) => ({ ...r, updated_at: r.updated_at.toISOString() }));
}

function isCriteriaSpec(v: unknown): v is CriteriaSpec {
  const d = v as CriteriaSpec | null;
  const strings = (a: unknown) => Array.isArray(a) && a.every((s) => typeof s === "string");
  return !!d && typeof d.description === "string" && strings(d.criteria) && strings(d.keywords) && strings(d.exclusions);
}

/** Every saved edit, in the shape the search builder takes. Focus areas without an edit are absent. */
export async function getCriteriaOverrides(): Promise<CriteriaOverrides> {
  const overrides: CriteriaOverrides = { sectors: {} };
  for (const rec of await listCriteriaRecords()) {
    if (rec.key === PLATFORM_EXCLUSIONS_KEY) {
      const text = (rec.data as { text?: unknown } | null)?.text;
      if (typeof text === "string") overrides.platformExclusions = text;
    } else if (isCriteriaSpec(rec.data)) {
      overrides.sectors[rec.key] = rec.data;
    }
  }
  return overrides;
}

/**
 * Saves one edit. `expectedUpdatedAt` is the version the editor was looking at (null if it had never
 * been edited); if someone else saved in between, nothing is written and `conflict` is returned.
 */
export async function saveCriteriaRecord(
  key: string,
  data: CriteriaSpec | { text: string },
  actorName: string,
  expectedUpdatedAt: string | null
): Promise<{ ok: true; updated_at: string } | { ok: false; reason: "conflict" }> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ updated_at: Date }>(
      `SELECT updated_at FROM criteria_settings WHERE key = $1 FOR UPDATE`,
      [key]
    );
    const current = existing.rows[0]?.updated_at.toISOString() ?? null;
    if (current !== expectedUpdatedAt) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "conflict" };
    }
    const saved = await client.query<{ updated_at: Date }>(
      `INSERT INTO criteria_settings (key, data, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, date_trunc('milliseconds', NOW()))
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
       RETURNING updated_at`,
      [key, JSON.stringify(data), actorName]
    );
    await client.query("COMMIT");
    return { ok: true, updated_at: saved.rows[0].updated_at.toISOString() };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Puts a focus area (or the shared platform exclusions) back to the shipped text. */
export async function deleteCriteriaRecord(key: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM criteria_settings WHERE key = $1`, [key]);
}

// ---- Google Sheet mirror ----

export interface SheetRow {
  type: "Add-On" | "Platform";
  mode: "For-Sale Listing" | "Proprietary Target";
  category: string;
  company: string;
  sourced_by: string | null;
  review: "New" | "Kept" | "Passed";
  website: string | null;
  source_url: string | null;
  location: string | null;
  employees: string | null;
  revenue_or_price: string | null;
  search_filters: string | null;
  why_fits: string | null;
  broker_source: string | null;
  listing_date: string | null;
  date_sourced: string;
  contact: string | null;
  pe_owned: string | null;
  /** Monday of the week the company was sourced, as YYYY-MM-DD in the given time zone. */
  week_start: string;
}

/** Every company from every account, for the Google Sheet. Weeks start on Monday in `timeZone`. */
export async function listSheetRows(timeZone: string): Promise<SheetRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT c.search_type, c.mode, c.category, c.company, c.website, c.link_to_listing, c.location, c.employees,
            c.revenue_or_price, c.search_filters, c.why_fits, c.broker_source, c.listing_date::text AS listing_date,
            c.contact, c.pe_owned, c.status, u.email AS sourced_by,
            (c.date_found AT TIME ZONE $1)::date::text AS date_sourced,
            date_trunc('week', c.date_found AT TIME ZONE $1)::date::text AS week_start
       FROM companies c LEFT JOIN users u ON u.id = c.owner_id
      ORDER BY c.date_found DESC`,
    [timeZone]
  );
  return rows.map((r) => ({
    type: r.search_type === "platform" ? "Platform" : "Add-On",
    mode: r.mode === "for_sale" ? "For-Sale Listing" : "Proprietary Target",
    category: r.category,
    company: r.company,
    sourced_by: r.sourced_by,
    review: r.status === "kept" ? "Kept" : r.status === "passed" ? "Passed" : "New",
    website: r.website,
    source_url: r.link_to_listing,
    location: r.location,
    employees: r.employees,
    revenue_or_price: r.revenue_or_price,
    search_filters: r.search_filters,
    why_fits: r.why_fits,
    broker_source: r.broker_source,
    listing_date: r.listing_date,
    date_sourced: r.date_sourced,
    contact: r.contact,
    pe_owned: r.mode === "proprietary" ? r.pe_owned : null,
    week_start: r.week_start,
  }));
}