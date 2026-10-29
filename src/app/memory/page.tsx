"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoryView } from "@/lib/db";
import { REASON_BY_CODE, RULE_THRESHOLD, type RuleStatus } from "@/lib/feedback";
import type { SearchType } from "@/lib/sectors";
import styles from "./memory.module.css";

const LIVE_REFRESH_MS = 12000;

const TABS: { type: SearchType; label: string }[] = [
  { type: "addon", label: "Add-On Search" },
  { type: "platform", label: "Platform Search" },
];

function ruleState(r: RuleStatus): { label: string; className: string } {
  if (!r.enabled) return { label: "Switched off", className: styles.stateOff };
  if (r.active) return { label: "Active", className: styles.stateOn };
  const need = RULE_THRESHOLD - r.count;
  return { label: `${need} more to activate`, className: styles.statePending };
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "";
}

export default function MemoryPage() {
  const [tab, setTab] = useState<SearchType>("addon");
  const [memory, setMemory] = useState<{ type: SearchType; data: MemoryView } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  const load = useCallback(async (type: SearchType) => {
    const res = await fetch(`/api/memory?type=${type}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load memory");
    if (type === tabRef.current) {
      setMemory({ type, data });
      setError(null);
    }
  }, []);

  useEffect(() => {
    load(tab).catch((e: Error) => setError(e.message));
  }, [tab, load]);

  // Live view: another person's keep, pass or rule change appears here within a few seconds.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(tab).catch(() => {});
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [tab, load]);

  const data = memory?.type === tab ? memory.data : null;

  const toggleRule = async (r: RuleStatus) => {
    const res = await fetch("/api/memory/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchType: tab, reason: r.code, enabled: !r.enabled }),
    });
    if (!res.ok) return window.alert((await res.json().catch(() => ({}))).error ?? "Could not update the rule");
    await load(tab);
  };

  const restore = async (id: number) => {
    const res = await fetch(`/api/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    if (!res.ok) return window.alert((await res.json().catch(() => ({}))).error ?? "Could not restore");
    await load(tab);
  };

  const forgetEverything = async () => {
    const label = TABS.find((t) => t.type === tab)!.label;
    if (
      !window.confirm(
        `Delete ALL ${label} results AND the passed-company memory? Passed companies could be suggested again. This cannot be undone.`
      )
    )
      return;
    const res = await fetch(`/api/companies?type=${tab}&scope=everything`, { method: "DELETE" });
    if (!res.ok) return window.alert((await res.json().catch(() => ({}))).error ?? "Could not clear");
    await load(tab);
  };

  return (
    <div className={styles.page}>
      <header className={styles.headerRow}>
        <h1>Rules &amp; Memory</h1>
        <Link href="/" className={styles.backLink}>
          &larr; Back to search
        </Link>
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

      <p className={styles.intro}>
        This is what the tool has learned from everyone&rsquo;s keep and pass decisions. It is shared across the firm and
        updates live. Passed companies are never suggested again. Firm-wide reasons used on at least {RULE_THRESHOLD}{" "}
        different companies become standing rules for every search in this tab. Each focus area also gets its own kept
        and passed companies as examples. Nothing here overrides the criteria written into the searches.
      </p>

      {error && <p className={styles.errorText}>{error}</p>}
      {!data && !error && <p className={styles.muted}>Loading&hellip;</p>}

      {data && (
        <>
          <section className={styles.section}>
            <h2>Rules</h2>
            <p className={styles.muted}>
              Switch a rule off if it came from a mistake. It stays off until you switch it back on.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Reason</th>
                    <th>Companies passed for this</th>
                    <th>Status</th>
                    <th>What it tells every search</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map((r) => {
                    const s = ruleState(r);
                    return (
                      <tr key={r.code}>
                        <td className={styles.strong}>{r.label}</td>
                        <td>{r.count}</td>
                        <td>
                          <span className={s.className}>{s.label}</span>
                        </td>
                        <td className={styles.ruleText}>{r.rule}</td>
                        <td>
                          <button className={r.enabled ? styles.switchOn : styles.switchOff} onClick={() => toggleRule(r)}>
                            {r.enabled ? "On" : "Off"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Examples fed into each focus area</h2>
            <p className={styles.muted}>
              Up to the 20 most recent kept and 20 most recent passed companies are shown to that focus area&rsquo;s
              search as examples.
            </p>
            {data.focusAreas.length === 0 ? (
              <p className={styles.muted}>No decisions yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Focus area</th>
                      <th>Kept</th>
                      <th>Passed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.focusAreas.map((f) => (
                      <tr key={f.category}>
                        <td className={styles.strong}>{f.category}</td>
                        <td>{f.kept}</td>
                        <td>{f.passed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h2>Passed companies ({data.passed.length})</h2>
            <p className={styles.muted}>Never suggested again, in any focus area or mode.</p>
            {data.passed.length === 0 ? (
              <p className={styles.muted}>None yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Focus area</th>
                      <th>Reasons</th>
                      <th>Note</th>
                      <th>Passed</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.passed.map((r) => (
                      <tr key={r.id}>
                        <td className={styles.strong}>
                          {r.website ? (
                            <a href={r.website} target="_blank" rel="noopener noreferrer">
                              {r.company}
                            </a>
                          ) : (
                            r.company
                          )}
                        </td>
                        <td>{r.category}</td>
                        <td>{r.pass_reasons.map((c) => REASON_BY_CODE[c]?.label ?? c).join("; ") || "No reason given"}</td>
                        <td>{r.pass_note}</td>
                        <td>{when(r.decided_at)}</td>
                        <td>
                          <button className={styles.smallButton} onClick={() => restore(r.id)}>
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h2>Kept companies ({data.kept.length})</h2>
            {data.kept.length === 0 ? (
              <p className={styles.muted}>None yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Focus area</th>
                      <th>Kept</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.kept.map((r) => (
                      <tr key={r.id}>
                        <td className={styles.strong}>
                          {r.website ? (
                            <a href={r.website} target="_blank" rel="noopener noreferrer">
                              {r.company}
                            </a>
                          ) : (
                            r.company
                          )}
                        </td>
                        <td>{r.category}</td>
                        <td>{when(r.decided_at)}</td>
                        <td>
                          <button className={styles.smallButton} onClick={() => restore(r.id)}>
                            Undo
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.dangerZone}>
            <h2>Start over</h2>
            <p className={styles.muted}>
              Deletes every result in this tab and the passed-company memory, so passed companies could be suggested
              again. The other tab is not affected.
            </p>
            <button className={styles.dangerButton} onClick={forgetEverything}>
              Delete everything in this tab
            </button>
          </section>
        </>
      )}
    </div>
  );
}
