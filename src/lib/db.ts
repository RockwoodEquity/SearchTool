import { Pool } from "pg";
import type { Mode } from "./sectors";

export interface CompanyRow {
  id: number;
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
  date_found: string;
}

export interface CompanyInsert {
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
  initialized = true;
}

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
      const dup = await client.query(
        `SELECT 1 FROM companies
         WHERE mode = $1
           AND (
             lower(trim(company)) = lower(trim($2))
             OR ($3::text IS NOT NULL AND lower(trim(website)) = lower(trim($3)))
           )
         LIMIT 1`,
        [row.mode, row.company, row.website]
      );
      if ((dup.rowCount ?? 0) > 0) continue;

      await client.query(
        `INSERT INTO companies (
          mode, category, company, website, link_to_listing, location,
          employees, revenue_or_price, why_fits, broker_source, listing_date,
          contact, pe_owned
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
        ]
      );
      inserted++;
    }
  } finally {
    client.release();
  }
  return inserted;
}

export async function deleteAllCompanies(): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM companies`);
}

export async function queryCompanies(start?: string, end?: string): Promise<CompanyRow[]> {
  await ensureSchema();

  const conditions: string[] = [];
  const params: string[] = [];

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
