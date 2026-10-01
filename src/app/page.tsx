"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sectorLabel, sectorsFor, type Mode, type SearchType } from "@/lib/sectors";
import styles from "./page.module.css";

type CategoryState = "idle" | "creating" | "running" | "collecting" | "done" | "error";

interface CategoryStatus {
  state: CategoryState;
  error?: string;
}

interface CompanyRow {
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

interface FilterInputs {
  minRevenueM: string;
  maxRevenueM: string;
  minEbitdaM: string;
  maxEbitdaM: string;
}

const EMPTY_FILTERS: FilterInputs = { minRevenueM: "", maxRevenueM: "", minEbitdaM: "", maxEbitdaM: "" };

const FILTER_FIELDS: { key: keyof FilterInputs; label: string }[] = [
  { key: "minRevenueM", label: "Min Revenue ($M)" },
  { key: "maxRevenueM", label: "Max Revenue ($M)" },
  { key: "minEbitdaM", label: "Min EBITDA ($M)" },
  { key: "maxEbitdaM", label: "Max EBITDA ($M)" },
];

// Shown only as placeholder hints on the platform tab; nothing is applied unless typed in.
const PLATFORM_HINTS: Record<keyof FilterInputs, string> = {
  minRevenueM: "e.g. 10",
  maxRevenueM: "e.g. 75",
  minEbitdaM: "e.g. 2",
  maxEbitdaM: "e.g. 7",
};

const TABS: { type: SearchType; label: string; blurb: string }[] = [
  {
    type: "addon",
    label: "Add-On Search",
    blurb: "Targeted add-on candidates in Rockwood's five add-on focus areas.",
  },
  {
    type: "platform",
    label: "Platform Search",
    blurb:
      "Broader search for new platform companies: North America HQ across Industrials, Specialized B2B, Regulated Industries, Aerospace & Defense, Environmental and Healthcare. Excludes contractors and heavy commodity-risk businesses.",
  },
];

const MODES: { mode: Mode; buttonLabel: string }[] = [
  { mode: "for_sale", buttonLabel: "Search For-Sale Listings" },
  { mode: "proprietary", buttonLabel: "Search Proprietary Targets" },
];

interface ColumnDef {
  header: string;
  render: (row: CompanyRow) => ReactNode;
  className?: string;
}

const SITE_LINK: ColumnDef = {
  header: "Website",
  render: (row) =>
    row.website ? (
      <a href={row.website} target="_blank" rel="noopener noreferrer">
        site
      </a>
    ) : null,
};

const SOURCE_LINK: ColumnDef = {
  header: "Source URL",
  render: (row) =>
    row.link_to_listing ? (
      <a href={row.link_to_listing} target="_blank" rel="noopener noreferrer">
        source
      </a>
    ) : null,
};

const DATE_FOUND: ColumnDef = {
  header: "Date Sourced",
  render: (row) => new Date(row.date_found).toLocaleDateString(),
};

const FILTER_COLUMN: ColumnDef = {
  header: "Revenue / EBITDA Filter",
  render: (row) => row.search_filters,
};

const FOR_SALE_COLUMNS: ColumnDef[] = [
  { header: "Category", render: (r) => r.category },
  { header: "Company", render: (r) => r.company },
  SITE_LINK,
  SOURCE_LINK,
  { header: "Location", render: (r) => r.location },
  { header: "Employees", render: (r) => r.employees },
  { header: "Asking Price / Revenue", render: (r) => r.revenue_or_price },
  FILTER_COLUMN,
  { header: "Why it fits", render: (r) => r.why_fits, className: "whyCell" },
  { header: "Broker/Source", render: (r) => r.broker_source },
  { header: "Listing Date", render: (r) => r.listing_date },
  DATE_FOUND,
];

const PROPRIETARY_COLUMNS: ColumnDef[] = [
  { header: "Category", render: (r) => r.category },
  { header: "Company", render: (r) => r.company },
  SITE_LINK,
  SOURCE_LINK,
  { header: "Location", render: (r) => r.location },
  { header: "Employees", render: (r) => r.employees },
  { header: "Est. Revenue", render: (r) => r.revenue_or_price },
  FILTER_COLUMN,
  { header: "Currently For Sale?", render: (r) => r.broker_source },
  { header: "Contact", render: (r) => r.contact },
  { header: "Already PE-owned?", render: (r) => r.pe_owned },
  { header: "Why it fits", render: (r) => r.why_fits, className: "whyCell" },
  DATE_FOUND,
];

type StatusMap = Record<SearchType, Record<Mode, Record<string, CategoryStatus>>>;

function idleStatuses(searchType: SearchType): Record<Mode, Record<string, CategoryStatus>> {
  const make = () =>
    Object.fromEntries(sectorsFor(searchType).map((k) => [k, { state: "idle" as CategoryState }]));
  return { for_sale: make(), proprietary: make() };
}

function initialStatuses(): StatusMap {
  return { addon: idleStatuses("addon"), platform: idleStatuses("platform") };
}

async function pollRunUntilDone(runId: string): Promise<void> {
  while (true) {
    const res = await fetch(`/api/agent/status?id=${runId}`);
    if (!res.ok) throw new Error("Failed to poll agent run status");
    const data = await res.json();
    if (data.status === "completed") return;
    if (data.status === "failed" || data.status === "cancelled") {
      throw new Error(data.error?.message ?? `Run ${data.status}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

function ResultsTable({ title, rows, columns }: { title: string; rows: CompanyRow[]; columns: ColumnDef[] }) {
  return (
    <div className={styles.tableBlock}>
      <h2 className={styles.tableTitle}>
        {title} <span className={styles.rowCount}>({rows.length})</span>
      </h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.header}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => (
                  <td key={c.header} className={c.className ? styles[c.className] : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className={styles.emptyRow}>
                  No results yet. Run a search above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<SearchType>("addon");
  const [statuses, setStatuses] = useState<StatusMap>(initialStatuses);
  const [running, setRunning] = useState<{ searchType: SearchType; mode: Mode } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [rowsData, setRowsData] = useState<{ type: SearchType; rows: CompanyRow[] } | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterInputs, setFilterInputs] = useState<Record<SearchType, FilterInputs>>({
    addon: EMPTY_FILTERS,
    platform: EMPTY_FILTERS,
  });

  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Rows are tagged with their tab, and a late response for another tab is dropped.
  const fetchRows = useCallback(
    async (type: SearchType) => {
      const params = new URLSearchParams({ type });
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      const res = await fetch(`/api/companies?${params.toString()}`);
      const data = await res.json();
      if (type === tabRef.current) setRowsData({ type, rows: data.rows ?? [] });
    },
    [startDate, endDate]
  );

  const refresh = async () => {
    setLoadingRows(true);
    try {
      await fetchRows(tab);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    fetchRows(tab);
  }, [tab, fetchRows]);

  const rows = useMemo(() => (rowsData?.type === tab ? rowsData.rows : []), [rowsData, tab]);

  const updateStatus = (searchType: SearchType, mode: Mode, sectorKey: string, patch: Partial<CategoryStatus>) => {
    setStatuses((prev) => ({
      ...prev,
      [searchType]: {
        ...prev[searchType],
        [mode]: {
          ...prev[searchType][mode],
          [sectorKey]: { ...prev[searchType][mode][sectorKey], ...patch },
        },
      },
    }));
  };

  const validatedFilters = (searchType: SearchType) => {
    const inputs = filterInputs[searchType];
    const inverted = (a: string, b: string) => a !== "" && b !== "" && Number(a) > Number(b);
    if (inverted(inputs.minRevenueM, inputs.maxRevenueM) || inverted(inputs.minEbitdaM, inputs.maxEbitdaM)) {
      window.alert("A minimum filter is larger than its maximum. Fix that before searching.");
      return null;
    }
    return Object.fromEntries(Object.entries(inputs).filter(([, v]) => v.trim() !== ""));
  };

  // Shared by both the "run all sectors" button and each category's own "Run" button.
  const runSectors = async (mode: Mode, sectorKeys: readonly string[]) => {
    const searchType = tab;
    const filters = validatedFilters(searchType);
    if (!filters) return;

    setRunning({ searchType, mode });
    setStatuses((prev) => ({
      ...prev,
      [searchType]: {
        ...prev[searchType],
        [mode]: {
          ...prev[searchType][mode],
          ...Object.fromEntries(sectorKeys.map((k) => [k, { state: "creating" as CategoryState }])),
        },
      },
    }));

    await Promise.all(
      sectorKeys.map(async (sectorKey) => {
        try {
          const createRes = await fetch("/api/agent/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ searchType, mode, sectorKey, filters }),
          });
          if (!createRes.ok) throw new Error((await createRes.json()).error ?? "Create failed");
          const { runId } = await createRes.json();

          updateStatus(searchType, mode, sectorKey, { state: "running" });
          await pollRunUntilDone(runId);

          updateStatus(searchType, mode, sectorKey, { state: "collecting" });
          const collectRes = await fetch("/api/agent/collect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId, searchType, mode, sectorKey, filters }),
          });
          if (!collectRes.ok) throw new Error((await collectRes.json()).error ?? "Collect failed");

          updateStatus(searchType, mode, sectorKey, { state: "done" });
          await fetchRows(searchType);
        } catch (err) {
          updateStatus(searchType, mode, sectorKey, {
            state: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      })
    );

    setRunning(null);
  };

  const runSearch = (mode: Mode) => runSectors(mode, sectorsFor(tab));
  const runOneSector = (mode: Mode, sectorKey: string) => runSectors(mode, [sectorKey]);

  const tabLabel = TABS.find((t) => t.type === tab)!.label;

  const resetTab = async () => {
    if (!window.confirm(`Delete all saved ${tabLabel} results? This cannot be undone. The other tab is not affected.`)) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/companies?type=${tab}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Reset failed");
      setStatuses((prev) => ({ ...prev, [tab]: idleStatuses(tab) }));
      await fetchRows(tab);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ type: tab });
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);
    return `/api/export?${params.toString()}`;
  }, [tab, startDate, endDate]);

  const forSaleRows = rows.filter((r) => r.mode === "for_sale");
  const proprietaryRows = rows.filter((r) => r.mode === "proprietary");
  const sectors = sectorsFor(tab);
  const busy = running !== null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Rockwood Search</h1>
      </header>

      <nav className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.type}
            role="tab"
            aria-selected={tab === t.type}
            className={tab === t.type ? styles.tabActive : styles.tab}
            onClick={() => setTab(t.type)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <p className={styles.tabBlurb}>{TABS.find((t) => t.type === tab)!.blurb}</p>

      <section className={styles.searchFilters}>
        <span className={styles.searchFiltersTitle}>
          Hard cutoffs for {tabLabel.toLowerCase()}es (leave blank for no limit)
        </span>
        {FILTER_FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder={tab === "platform" ? PLATFORM_HINTS[f.key] : undefined}
              value={filterInputs[tab][f.key]}
              onChange={(e) =>
                setFilterInputs((prev) => ({ ...prev, [tab]: { ...prev[tab], [f.key]: e.target.value } }))
              }
              disabled={busy}
            />
          </label>
        ))}
        {tab === "platform" && (
          <span className={styles.filterHint}>
            Rockwood&rsquo;s stated target range is $10&ndash;75M revenue and $2&ndash;7M EBITDA. Nothing is applied unless you enter it here.
          </span>
        )}
      </section>

      <section className={styles.runPanel}>
        {MODES.map(({ mode, buttonLabel }) => (
          <div key={mode} className={styles.modeBlock}>
            <button className={styles.runButton} disabled={busy} onClick={() => runSearch(mode)}>
              {running?.searchType === tab && running.mode === mode ? "Running…" : buttonLabel}
            </button>
            <ul className={styles.statusList}>
              {sectors.map((key) => {
                const s = statuses[tab][mode][key];
                return (
                  <li key={key} className={styles[`status_${s.state}`]}>
                    <span>{sectorLabel(key)}</span>
                    <span className={styles.statusDetail}>
                      {s.state === "idle" && "idle"}
                      {s.state === "creating" && "creating…"}
                      {s.state === "running" && "researching…"}
                      {s.state === "collecting" && "saving…"}
                      {s.state === "done" && "done"}
                      {s.state === "error" && `error: ${s.error}`}
                    </span>
                    <button
                      className={styles.runOneButton}
                      disabled={busy}
                      onClick={() => runOneSector(mode, key)}
                    >
                      Run
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className={styles.filterBar}>
        <label>
          Start Date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          End Date
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button onClick={refresh} disabled={loadingRows}>
          {loadingRows ? "Loading…" : "Refresh"}
        </button>
        <a className={styles.exportButton} href={exportHref}>
          Download Excel
        </a>
        <button className={styles.resetButton} onClick={resetTab} disabled={resetting}>
          {resetting ? "Resetting…" : `Reset ${tabLabel} Results`}
        </button>
        <span className={styles.rowCount}>{rows.length} total rows</span>
      </section>

      <ResultsTable title="For-Sale Listings" rows={forSaleRows} columns={FOR_SALE_COLUMNS} />
      <ResultsTable title="Proprietary Targets" rows={proprietaryRows} columns={PROPRIETARY_COLUMNS} />
    </div>
  );
}
