"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch, type Me } from "@/lib/client";
import { PASS_REASONS, REASON_BY_CODE, type ReviewAction, type ReviewStatus } from "@/lib/feedback";
import {
  SEARCH_PASSES,
  sectorLabel,
  sectorsFor,
  type Mode,
  type SearchPass,
  type SearchType,
} from "@/lib/sectors";
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
  status: ReviewStatus;
  pass_reasons: string[];
  pass_note: string | null;
  owner_id: number | null;
  owner_name: string | null;
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
    const res = await apiFetch(`/api/agent/status?id=${runId}`);
    if (!res.ok) throw new Error("Failed to poll agent run status");
    const data = await res.json();
    if (data.status === "completed") return;
    if (data.status === "failed" || data.status === "cancelled") {
      throw new Error(data.error?.message ?? `Run ${data.status}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

interface ReviewHandlers {
  onKeep: (row: CompanyRow) => void;
  onPass: (row: CompanyRow) => void;
  onRestore: (row: CompanyRow) => void;
}

// Master Database: shows whether something was kept or passed, but decisions are made in the owner's own tab.
function StatusCell({ row }: { row: CompanyRow }) {
  if (row.status === "passed") {
    const reasons = row.pass_reasons.map((c) => REASON_BY_CODE[c]?.label ?? c);
    return (
      <div className={styles.reviewCell}>
        <span className={styles.passedTag}>Passed</span>
        {reasons.length > 0 && <span className={styles.passedWhy}>{reasons.join("; ")}</span>}
        {row.pass_note && <span className={styles.passedWhy}>&ldquo;{row.pass_note}&rdquo;</span>}
      </div>
    );
  }
  return <span className={row.status === "kept" ? styles.keptTag : styles.newTag}>{row.status === "kept" ? "Kept" : "Not reviewed"}</span>;
}

function ReviewCell({ row, onKeep, onPass, onRestore }: { row: CompanyRow } & ReviewHandlers) {
  if (row.status === "passed") {
    const reasons = row.pass_reasons.map((c) => REASON_BY_CODE[c]?.label ?? c);
    return (
      <div className={styles.reviewCell}>
        <span className={styles.passedTag}>Passed</span>
        {reasons.length > 0 && <span className={styles.passedWhy}>{reasons.join("; ")}</span>}
        {row.pass_note && <span className={styles.passedWhy}>&ldquo;{row.pass_note}&rdquo;</span>}
        <button className={styles.restoreButton} onClick={() => onRestore(row)}>
          Restore
        </button>
      </div>
    );
  }
  return (
    <div className={styles.reviewCell}>
      <button
        className={row.status === "kept" ? styles.keepButtonOn : styles.keepButton}
        title={row.status === "kept" ? "Kept. Click to undo" : "Keep: this is a good fit"}
        aria-pressed={row.status === "kept"}
        onClick={() => (row.status === "kept" ? onRestore(row) : onKeep(row))}
      >
        &#10003;
      </button>
      <button className={styles.passButton} title="Pass: remove this from the list" onClick={() => onPass(row)}>
        &#10005;
      </button>
    </div>
  );
}

const SOURCED_BY: ColumnDef = { header: "Sourced by", render: (r) => r.owner_name };

// In the Master Database, show who found each company right after its name.
function withOwner(columns: ColumnDef[]): ColumnDef[] {
  const at = columns.findIndex((c) => c.header === "Company");
  return at < 0 ? [SOURCED_BY, ...columns] : [...columns.slice(0, at + 1), SOURCED_BY, ...columns.slice(at + 1)];
}

function ResultsTable({
  title,
  rows,
  columns,
  handlers,
  readOnly = false,
}: {
  title: string;
  rows: CompanyRow[];
  columns: ColumnDef[];
  handlers: ReviewHandlers;
  readOnly?: boolean;
}) {
  const passedCount = rows.filter((r) => r.status === "passed").length;
  const activeCount = rows.length - passedCount;
  return (
    <div className={styles.tableBlock}>
      <h2 className={styles.tableTitle}>
        {title}{" "}
        <span className={styles.rowCount}>
          ({activeCount}
          {passedCount > 0 ? `, ${passedCount} passed` : ""})
        </span>
      </h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.reviewHead}>Review</th>
              {columns.map((c) => (
                <th key={c.header}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={row.status === "passed" ? styles.rowPassed : row.status === "kept" ? styles.rowKept : undefined}
              >
                <td className={styles.reviewTd}>
                  {readOnly ? <StatusCell row={row} /> : <ReviewCell row={row} {...handlers} />}
                </td>
                {columns.map((c) => (
                  <td key={c.header} className={c.className ? styles[c.className] : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className={styles.emptyRow}>
                  {readOnly ? "Nothing here yet." : "No results yet. Run a search above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LIVE_REFRESH_MS = 12000;

function PassDialog({
  row,
  onCancel,
  onConfirm,
}: {
  row: CompanyRow;
  onCancel: () => void;
  onConfirm: (reasons: string[], note: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const toggle = (code: string) =>
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const group = (scope: "firm" | "focus" | "data", heading: string, hint: string) => (
    <div className={styles.reasonGroup}>
      <div className={styles.reasonHeading}>
        {heading} <span className={styles.reasonHint}>{hint}</span>
      </div>
      <div className={styles.chips}>
        {PASS_REASONS.filter((r) => r.scope === scope).map((r) => (
          <button
            key={r.code}
            type="button"
            className={selected.includes(r.code) ? styles.chipOn : styles.chip}
            aria-pressed={selected.includes(r.code)}
            onClick={() => toggle(r.code)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.dialogTitle}>Pass on {row.company}?</h3>
        <p className={styles.dialogSub}>
          It will be greyed out, left out of the Excel export, and never suggested again. Reasons are optional, but they
          teach future searches.
        </p>
        {group("firm", "Firm-wide", "teaches every search in this tab")}
        {group("focus", "This focus area only", "")}
        {group("data", "Data problem", "")}
        <textarea
          className={styles.noteBox}
          placeholder="Optional note"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className={styles.dialogButtons}>
          <button className={styles.dialogCancel} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.dialogPass} onClick={() => onConfirm(selected, note)}>
            Pass
          </button>
        </div>
      </div>
    </div>
  );
}

type RowsView = "mine" | "master";

const OLD_ROW_DAYS = 14;

export default function Home() {
  const [tab, setTab] = useState<SearchType>("addon");
  // "mine" is your own tab; "master" is everyone's combined, read-only.
  const [view, setView] = useState<RowsView>("mine");
  const [me, setMe] = useState<Me | null>(null);
  const [passTarget, setPassTarget] = useState<CompanyRow | null>(null);
  const [hidePassed, setHidePassed] = useState(false);
  const [hideOld, setHideOld] = useState(false);
  const [statuses, setStatuses] = useState<StatusMap>(initialStatuses);
  const [running, setRunning] = useState<{ searchType: SearchType; mode: Mode } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [rowsData, setRowsData] = useState<{ type: SearchType; view: RowsView; rows: CompanyRow[] } | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterInputs, setFilterInputs] = useState<Record<SearchType, FilterInputs>>({
    addon: EMPTY_FILTERS,
    platform: EMPTY_FILTERS,
  });

  const isMaster = view === "master";

  useEffect(() => {
    apiFetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => {});
  }, []);

  const tabRef = useRef(tab);
  const viewRef = useRef(view);
  useEffect(() => {
    tabRef.current = tab;
    viewRef.current = view;
  }, [tab, view]);

  // Rows are tagged with the tab and view they were loaded for, and a late response for another one is dropped.
  const fetchRows = useCallback(
    async (type: SearchType, rowsView: RowsView) => {
      const params = new URLSearchParams({ type, view: rowsView });
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      const res = await apiFetch(`/api/companies?${params.toString()}`);
      const data = await res.json();
      if (type === tabRef.current && rowsView === viewRef.current) {
        setRowsData({ type, view: rowsView, rows: data.rows ?? [] });
      }
    },
    [startDate, endDate]
  );

  const refresh = async () => {
    setLoadingRows(true);
    try {
      await fetchRows(tab, view);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    fetchRows(tab, view);
  }, [tab, view, fetchRows]);

  // Live view: re-read the list every few seconds so decisions and new finds show up without a reload.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchRows(tab, view).catch(() => {});
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [tab, view, fetchRows]);

  const rows = useMemo(
    () => (rowsData?.type === tab && rowsData.view === view ? rowsData.rows : []),
    [rowsData, tab, view]
  );

  const review = async (row: CompanyRow, action: ReviewAction, reasons: string[] = [], note = "") => {
    const res = await apiFetch(`/api/companies/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reasons, note }),
    });
    if (!res.ok) {
      window.alert((await res.json().catch(() => ({}))).error ?? "Could not save that decision");
      return;
    }
    await fetchRows(tab, view);
  };

  const handlers: ReviewHandlers = {
    onKeep: (row) => review(row, "keep"),
    onPass: (row) => setPassTarget(row),
    onRestore: (row) => review(row, "restore"),
  };

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

    // One full create -> wait -> save cycle for a single pass of a single focus area.
    const runPass = async (sectorKey: string, pass: SearchPass) => {
      const createRes = await apiFetch("/api/agent/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchType, mode, sectorKey, filters, pass }),
      });
      if (!createRes.ok) throw new Error((await createRes.json().catch(() => ({}))).error ?? "Create failed");
      const { runId } = await createRes.json();

      updateStatus(searchType, mode, sectorKey, { state: "running" });
      await pollRunUntilDone(runId);

      const collectRes = await apiFetch("/api/agent/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, searchType, mode, sectorKey, filters }),
      });
      if (!collectRes.ok) throw new Error((await collectRes.json().catch(() => ({}))).error ?? "Collect failed");
      await fetchRows(searchType, "mine");
    };

    await Promise.all(
      sectorKeys.map(async (sectorKey) => {
        const results = await Promise.allSettled(SEARCH_PASSES.map((pass) => runPass(sectorKey, pass)));
        const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        const message = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : "Unknown error");

        if (failures.length === results.length) {
          updateStatus(searchType, mode, sectorKey, { state: "error", error: message(failures[0]) });
        } else {
          updateStatus(searchType, mode, sectorKey, {
            state: "done",
            error: failures.length > 0 ? `1 of ${results.length} passes failed: ${message(failures[0])}` : undefined,
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
    if (
      !window.confirm(
        `Clear YOUR ${tabLabel} results? Only companies your searches found are removed: the other person's list and the Master Database are not touched. Passed companies are kept as the firm's memory, so they will still never be suggested again. This cannot be undone.`
      )
    )
      return;
    setResetting(true);
    try {
      const res = await apiFetch(`/api/companies?type=${tab}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Reset failed");
      setStatuses((prev) => ({ ...prev, [tab]: idleStatuses(tab) }));
      await fetchRows(tab, "mine");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ type: tab, view });
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);
    return `/api/export?${params.toString()}`;
  }, [tab, view, startDate, endDate]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  };

  // "Date sourced" is when the company was saved. Older than two weeks can be tucked away.
  const [now] = useState(() => Date.now());
  const isOld = (r: CompanyRow) => now - new Date(r.date_found).getTime() > OLD_ROW_DAYS * 86400000;
  const visibleRows = rows.filter((r) => !(hidePassed && r.status === "passed") && !(hideOld && isOld(r)));
  const forSaleRows = visibleRows.filter((r) => r.mode === "for_sale");
  const proprietaryRows = visibleRows.filter((r) => r.mode === "proprietary");
  const passedTotal = rows.filter((r) => r.status === "passed").length;
  const keptTotal = rows.filter((r) => r.status === "kept").length;
  const sectors = sectorsFor(tab);
  const busy = running !== null;

  return (
    <div className={styles.page}>
      <header className={styles.headerRow}>
        <h1>Rockwood Search</h1>
        <div className={styles.userBar}>
          {me && <span className={styles.userName}>{me.name}</span>}
          <Link href="/memory" className={styles.memoryLink}>
            Rules &amp; Memory
          </Link>
          <Link href="/account" className={styles.plainLink}>
            Account
          </Link>
          <button className={styles.plainLinkButton} onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <nav className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.type}
            role="tab"
            aria-selected={!isMaster && tab === t.type}
            className={!isMaster && tab === t.type ? styles.tabActive : styles.tab}
            onClick={() => {
              setTab(t.type);
              setView("mine");
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          role="tab"
          aria-selected={isMaster}
          className={isMaster ? styles.tabActive : styles.tab}
          onClick={() => setView("master")}
        >
          Master Database
        </button>
      </nav>

      {isMaster ? (
        <>
          <p className={styles.tabBlurb}>
            Everything either of you has sourced, combined, with its review status. This view is read-only: decisions and
            Reset happen in your own tabs, on companies your searches found.
          </p>
          <div className={styles.masterSwitch}>
            {TABS.map((t) => (
              <button
                key={t.type}
                className={tab === t.type ? styles.masterOptionOn : styles.masterOption}
                onClick={() => setTab(t.type)}
              >
                {t.label.replace(" Search", "")}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className={styles.tabBlurb}>{TABS.find((t) => t.type === tab)!.blurb}</p>
      )}

      {!isMaster && (
      <>
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
                      {s.state === "running" && "researching (2 passes)…"}
                      {s.state === "done" && (s.error ? `done, but ${s.error}` : "done")}
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
      </>
      )}

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
        {!isMaster && (
          <button className={styles.resetButton} onClick={resetTab} disabled={resetting}>
            {resetting ? "Resetting…" : "Reset my results"}
          </button>
        )}
        <label className={styles.hideToggle}>
          <input type="checkbox" checked={hidePassed} onChange={(e) => setHidePassed(e.target.checked)} />
          Hide passed rows
        </label>
        <label className={styles.hideToggle}>
          <input type="checkbox" checked={hideOld} onChange={(e) => setHideOld(e.target.checked)} />
          Hide rows older than 2 weeks
        </label>
        <span className={styles.rowCount}>
          {rows.length - passedTotal} active &middot; {keptTotal} kept &middot; {passedTotal} passed
        </span>
      </section>

      <ResultsTable
        title="For-Sale Listings"
        rows={forSaleRows}
        columns={isMaster ? withOwner(FOR_SALE_COLUMNS) : FOR_SALE_COLUMNS}
        handlers={handlers}
        readOnly={isMaster}
      />
      <ResultsTable
        title="Proprietary Targets"
        rows={proprietaryRows}
        columns={isMaster ? withOwner(PROPRIETARY_COLUMNS) : PROPRIETARY_COLUMNS}
        handlers={handlers}
        readOnly={isMaster}
      />

      {passTarget && (
        <PassDialog
          row={passTarget}
          onCancel={() => setPassTarget(null)}
          onConfirm={async (reasons, note) => {
            const target = passTarget;
            setPassTarget(null);
            await review(target, "pass", reasons, note);
          }}
        />
      )}
    </div>
  );
}
