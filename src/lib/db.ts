import { Pool } from "pg";
import type { Mode, SearchType } from "./sectors";

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
  await getPool().query(`
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
  await getPool().query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS search_filters TEXT`);
  await getPool().query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS search_type TEXT NOT NULL DEFAULT 'addon'`);
  initialized = true;
}

const SQL_NORM_NAME = (col: string) =>
  `NULLIF(regexp_replace(regexp_replace(lower(${col}), '\\m(inc|llc|ltd|limited|corp|corporation|co|company|lp|llp)\\M', '', 'g'), '[^a-z0-9]+', '', 'g'), '')`;

const SQL_HOST = (col: string) =>
  `NULLIF(regexp_replace(lower(trim(${col})), '^(https?://)?(www\\.)?([^/?#:]+).*$', '\\3'), '')`;

/**
 * Dedupe key is intentionally just identity (mode + company name, or mode + website) —
 * not enrichment fields like pe_owned, which can vary run to run for the same company.
 */
export async function insertCompanies(rows: CompanyInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureSchema();
  const client = await getPool().connect();
  let inserted = 0;
  try {
    for (const row of rows) {
      // Same company if the normalized name matches (ignores case, punctuation, Inc/LLC/Ltd-style
      // suffixes) or the website hostname matches (ignores www, path and query).
      const dup = await client.query(
        `SELECT 1 FROM companies
         WHERE search_type = $4
           AND mode = $1
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

/** Deletes only the given search type's rows, so resetting one tab never touches the other. */
export async function deleteCompaniesOfType(searchType: SearchType): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM companies WHERE search_type = $1`, [searchType]);
}

export async function queryCompanies(
  searchType: SearchType,
  start?: string,
  end?: string
): Promise<CompanyRow[]> {
  await ensureSchema();

  const conditions: string[] = [`search_type = $1`];
  const params: string[] = [searchType];

  if (start) {
    params.push(start);
    conditions.push(`COALESCE(listing_date, date_found::date) >= $${params.length}::date`);
  }
  if (end) {
    params.push(end);
    conditions.push(`COALESCE(listing_date, date_found::date) <= $${params.length}::date`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await getPool().query<CompanyRow>(
    `SELECT * FROM companies ${where} ORDER BY date_found DESC`,
    params
  );
  return rows;
}
