"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { SECTOR_ORDER, type Mode } from "@/lib/sectors";
import styles from "./page.module.css";

const SECTOR_LABELS: Record<string, string> = {
  environmental_services: "Environmental Services",
  facility_services: "Facility Services",
  utility_services: "Utility Services",
  manufacturing: "Manufacturing",
  b2b_services: "B2B Services",
};

type CategoryState = "idle" | "creating" | "running" | "collecting" | "done" | "error";

interface CategoryStatus {
  state: CategoryState;
  error?: string;
}

interface CompanyRow {
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

function initialStatuses(): Record<Mode, Record<string, CategoryStatus>> {
  const make = () =>
    Object.fromEntries(SECTOR_ORDER.map((k) => [k, { state: "idle" as CategoryState }]));
  return { for_sale: make(), proprietary: make() };
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
  const [statuses, setStatuses] = useState(initialStatuses());
  const [runningMode, setRunningMode] = useState<Mode | null>(null);
  const [resetting, setResetting] = useState(false);
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterInputs, setFilterInputs] = useState<FilterInputs>(EMPTY_FILTERS);

  const fetchRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      const res = await fetch(`/api/companies?${params.toString()}`);
      const data = await res.json();
      setRows(data.rows ?? []);
    } finally {
      setLoadingRows(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const updateStatus = (mode: Mode, sectorKey: string, patch: Partial<CategoryStatus>) => {
    setStatuses((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], [sectorKey]: { ...prev[mode][sectorKey], ...patch } },
    }));
  };

  const runSearch = async (mode: Mode) => {
    const filters = Object.fromEntries(
      Object.entries(filterInputs).filter(([, v]) => v.trim() !== "")
    );
    const min = (a: string, b: string) => a !== "" && b !== "" && Number(a) > Number(b);
    if (min(filterInputs.minRevenueM, filterInputs.maxRevenueM) || min(filterInputs.minEbitdaM, filterInputs.maxEbitdaM)) {
      window.alert("A minimum filter is larger than its maximum. Fix that before searching.");
      return;
    }
    setRunningMode(mode);
    setStatuses((prev) => ({
      ...prev,
      [mode]: Object.fromEntries(SECTOR_ORDER.map((k) => [k, { state: "creating" as CategoryState }])),
    }));

    await Promise.all(
      SECTOR_ORDER.map(async (sectorKey) => {
        try {
          const createRes = await fetch("/api/agent/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, sectorKey, filters }),
          });
          if (!createRes.ok) throw new Error((await createRes.json()).error ?? "Create failed");
          const { runId } = await createRes.json();

          updateStatus(mode, sectorKey, { state: "running" });
          await pollRunUntilDone(runId);

          updateStatus(mode, sectorKey, { state: "collecting" });
          const collectRes = await fetch("/api/agent/collect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId, mode, sectorKey, filters }),
          });
          if (!collectRes.ok) throw new Error((await collectRes.json()).error ?? "Collect failed");

          updateStatus(mode, sectorKey, { state: "done" });
          await fetchRows();
        } catch (err) {
          updateStatus(mode, sectorKey, {
            state: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      })
    );

    setRunningMode(null);
  };

  const resetAll = async () => {
    if (!window.confirm("Delete all saved results? This cannot be undone.")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/companies", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Reset failed");
      setStatuses(initialStatuses());
      await fetchRows();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);
    const qs = params.toString();
    return `/api/export${qs ? `?${qs}` : ""}`;
  }, [startDate, endDate]);

  const forSaleRows = rows.filter((r) => r.mode === "for_sale");
  const proprietaryRows = rows.filter((r) => r.mode === "proprietary");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Rockwood Add-On Search</h1>
      </header>

      <section className={styles.searchFilters}>
        <span className={styles.searchFiltersTitle}>Hard cutoffs for searches (leave blank for no limit)</span>
        {FILTER_FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={filterInputs[f.key]}
              onChange={(e) => setFilterInputs((prev) => ({ ...prev, [f.key]: e.target.value }))}
              disabled={runningMode !== null}
            />
          </label>
        ))}
      </section>

      <section className={styles.runPanel}>
        <div className={styles.modeBlock}>
          <button
            className={styles.runButton}
            disabled={runningMode !== null}
            onClick={() => runSearch("for_sale")}
          >
            {runningMode === "for_sale" ? "Running…" : "Search For-Sale Listings"}
          </button>
          <ul className={styles.statusList}>
            {SECTOR_ORDER.map((key) => {
              const s = statuses.for_sale[key];
              return (
                <li key={key} className={styles[`status_${s.state}`]}>
                  <span>{SECTOR_LABELS[key]}</span>
                  <span className={styles.statusDetail}>
                    {s.state === "idle" && "idle"}
                    {s.state === "creating" && "creating…"}
                    {s.state === "running" && "researching…"}
                    {s.state === "collecting" && "saving…"}
                    {s.state === "done" && "done"}
                    {s.state === "error" && `error: ${s.error}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.modeBlock}>
          <button
            className={styles.runButton}
            disabled={runningMode !== null}
            onClick={() => runSearch("proprietary")}
          >
            {runningMode === "proprietary" ? "Running…" : "Search Proprietary Targets"}
          </button>
          <ul className={styles.statusList}>
            {SECTOR_ORDER.map((key) => {
              const s = statuses.proprietary[key];
              return (
                <li key={key} className={styles[`status_${s.state}`]}>
                  <span>{SECTOR_LABELS[key]}</span>
                  <span className={styles.statusDetail}>
                    {s.state === "idle" && "idle"}
                    {s.state === "creating" && "creating…"}
                    {s.state === "running" && "researching…"}
                    {s.state === "collecting" && "saving…"}
                    {s.state === "done" && "done"}
                    {s.state === "error" && `error: ${s.error}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
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
        <button onClick={fetchRows} disabled={loadingRows}>
          {loadingRows ? "Loading…" : "Refresh"}
        </button>
        <a className={styles.exportButton} href={exportHref}>
          Download Excel
        </a>
        <button className={styles.resetButton} onClick={resetAll} disabled={resetting}>
          {resetting ? "Resetting…" : "Reset All Results"}
        </button>
        <span className={styles.rowCount}>{rows.length} total rows</span>
      </section>

      <ResultsTable title="For-Sale Listings" rows={forSaleRows} columns={FOR_SALE_COLUMNS} />
      <ResultsTable title="Proprietary Targets" rows={proprietaryRows} columns={PROPRIETARY_COLUMNS} />
    </div>
  );
}
