"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  date_found: string;
}

const MODE_LABEL: Record<Mode, string> = {
  for_sale: "For-Sale Listing",
  proprietary: "Proprietary Target",
};

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

export default function Home() {
  const [statuses, setStatuses] = useState(initialStatuses());
  const [runningMode, setRunningMode] = useState<Mode | null>(null);
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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
            body: JSON.stringify({ mode, sectorKey }),
          });
          if (!createRes.ok) throw new Error((await createRes.json()).error ?? "Create failed");
          const { runId } = await createRes.json();

          updateStatus(mode, sectorKey, { state: "running" });
          await pollRunUntilDone(runId);

          updateStatus(mode, sectorKey, { state: "collecting" });
          const collectRes = await fetch("/api/agent/collect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId, mode, sectorKey }),
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

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);
    const qs = params.toString();
    return `/api/export${qs ? `?${qs}` : ""}`;
  }, [startDate, endDate]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Rockwood Add-On Search</h1>
      </header>

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
        <span className={styles.rowCount}>{rows.length} rows</span>
      </section>

      <section className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Mode</th>
              <th>Category</th>
              <th>Company</th>
              <th>Website</th>
              <th>Link to Listing</th>
              <th>Location</th>
              <th>Employees</th>
              <th>Est. Revenue / Asking Price</th>
              <th>Why it fits</th>
              <th>Broker/Source</th>
              <th>Listing Date</th>
              <th>Date Found</th>
              <th>Contact</th>
              <th>Already PE-owned?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{MODE_LABEL[row.mode]}</td>
                <td>{row.category}</td>
                <td>{row.company}</td>
                <td>
                  {row.website ? (
                    <a href={row.website} target="_blank" rel="noopener noreferrer">
                      site
                    </a>
                  ) : null}
                </td>
                <td>
                  {row.link_to_listing ? (
                    <a href={row.link_to_listing} target="_blank" rel="noopener noreferrer">
                      listing
                    </a>
                  ) : null}
                </td>
                <td>{row.location}</td>
                <td>{row.employees}</td>
                <td>{row.revenue_or_price}</td>
                <td className={styles.whyCell}>{row.why_fits}</td>
                <td>{row.broker_source}</td>
                <td>{row.listing_date}</td>
                <td>{new Date(row.date_found).toLocaleString()}</td>
                <td>{row.contact}</td>
                <td>{row.mode === "proprietary" ? row.pe_owned : ""}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className={styles.emptyRow}>
                  No results yet. Run a search above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
