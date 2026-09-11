# Rockwood Add-On Search

Runs two Exa Agent research passes (For-Sale Listings, Proprietary Targets) across
five sectors, saves accumulating results to Postgres, and exports a filtered,
formatted Excel workbook.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.local` and set your Exa API key:

   ```
   EXA_API_KEY=your-exa-api-key
   ```

3. Provision a Postgres database (Supabase, Neon, Vercel Postgres, or any Postgres
   works — the app connects with the standard `pg` client, not a vendor-specific
   SDK):

   - **Supabase**: create a project, then Project Settings → Database →
     Connection string → URI (use "Transaction" pooler mode for serverless).
   - Set it in `.env.local`:

     ```
     DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres
     ```

   The `companies` table is created automatically on first use (see
   `src/lib/db.ts`) — no manual migration needed.

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Deploying

Push to a git repo and import the project on Vercel, or run `vercel --prod`. Set
`EXA_API_KEY` and `DATABASE_URL` under Project Settings → Environment Variables.

## How it works

- **Search**: clicking "Search For-Sale Listings" or "Search Proprietary Targets"
  kicks off 5 Exa Agent runs (one per sector) via `POST /api/agent/create`. Each
  run does open-ended multi-step web research and returns results validated
  against a JSON Schema. The browser polls `GET /api/agent/status` every few
  seconds per category (Vercel serverless functions can't block for the
  multi-minute duration of an agent run).
- **Collect**: once a category's run reaches `completed`, the browser calls
  `POST /api/agent/collect`, which reads `output.structured` and writes rows
  into the `companies` table, tagged with `mode`, `category`, and `date_found`.
- **Table / filter**: the page always reads from the database
  (`GET /api/companies`), newest first, so history accumulates across runs. The
  Start/End Date filters match against `listing_date` when present (Mode A
  only), falling back to `date_found`.
- **Export**: "Download Excel" hits `GET /api/export`, which re-queries the
  database with the same date filter and streams back a formatted `.xlsx` file
  (bold frozen header, autosized columns, autofilter) built with `exceljs`.

## Sector / mode config

Sector descriptions, criteria, and per-mode query/schema construction live in
`src/lib/sectors.ts`. Mode A (`for_sale`) requires an active for-sale listing
and asks for asking price, revenue/EBITDA, broker/marketplace, and listing
date. Mode B (`proprietary`) uses the sector descriptions directly, emphasizing
independent ownership, and asks for estimated revenue, a for-sale/PE-owned
signal, and a public contact.

Agent runs use `effort: "low"` to keep cost predictable — a single 3-company
test run cost about $0.36. Bump it in `src/app/api/agent/create/route.ts` if
you want deeper research at higher cost.
