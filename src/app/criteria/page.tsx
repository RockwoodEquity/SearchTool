"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client";
import { PLATFORM_EXCLUSIONS_KEY, type CriteriaSpec, type SearchType } from "@/lib/sectors";
import memory from "../memory/memory.module.css";
import styles from "./criteria.module.css";

const TABS: { type: SearchType; label: string }[] = [
  { type: "addon", label: "Add-On Search" },
  { type: "platform", label: "Platform Search" },
];

interface Item {
  key: string;
  label: string;
  defaults: CriteriaSpec;
  current: CriteriaSpec;
  custom: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface ExclusionItem {
  defaults: string;
  current: string;
  custom: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface Payload {
  items: Item[];
  platformExclusions: ExclusionItem | null;
}

const lines = (a: string[]) => a.join("\n");
const split = (s: string) => s.split("\n");

function stamp(by: string | null, at: string | null): string {
  if (!by || !at) return "As shipped";
  return `Edited by ${by} on ${new Date(at).toLocaleDateString()}`;
}

interface CardProps {
  title: string;
  custom: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
  children: React.ReactNode;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  justSaved: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onRestore: () => void;
}

function Card(p: CardProps) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2>{p.title}</h2>
        <span className={p.custom ? styles.editedTag : styles.shippedTag}>{stamp(p.updatedBy, p.updatedAt)}</span>
      </div>
      {p.children}
      {p.error && <p className={styles.cardError}>{p.error}</p>}
      <div className={styles.actions}>
        <button className={styles.saveButton} onClick={p.onSave} disabled={!p.dirty || p.saving}>
          {p.saving ? "Saving…" : "Save"}
        </button>
        <button className={styles.plainButton} onClick={p.onDiscard} disabled={!p.dirty || p.saving}>
          Discard changes
        </button>
        <button className={styles.plainButton} onClick={p.onRestore} disabled={!p.custom || p.saving}>
          Restore original
        </button>
        {p.dirty && <span className={styles.unsavedNote}>Unsaved changes</span>}
        {!p.dirty && p.justSaved && <span className={styles.savedNote}>Saved. Searches use this now.</span>}
      </div>
    </section>
  );
}

function FocusCard({ item, saved, onChanged }: { item: Item; saved: boolean; onChanged: (savedKey?: string) => Promise<void> }) {
  const [description, setDescription] = useState(item.current.description);
  const [criteria, setCriteria] = useState(lines(item.current.criteria));
  const [keywords, setKeywords] = useState(lines(item.current.keywords));
  const [exclusions, setExclusions] = useState(lines(item.current.exclusions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    description !== item.current.description ||
    criteria !== lines(item.current.criteria) ||
    keywords !== lines(item.current.keywords) ||
    exclusions !== lines(item.current.exclusions);

  const discard = () => {
    setDescription(item.current.description);
    setCriteria(lines(item.current.criteria));
    setKeywords(lines(item.current.keywords));
    setExclusions(lines(item.current.exclusions));
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await apiFetch("/api/criteria", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: item.key,
        description,
        criteria: split(criteria),
        keywords: split(keywords),
        exclusions: split(exclusions),
        expectedUpdatedAt: item.updatedAt,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save");
      if (res.status === 409) await onChanged();
      return;
    }
    await onChanged(item.key);
  };

  const restore = async () => {
    if (!window.confirm(`Put "${item.label}" back to its original criteria? Your edits to it are lost for everyone.`)) return;
    setSaving(true);
    const res = await apiFetch(`/api/criteria?key=${encodeURIComponent(item.key)}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not restore");
    await onChanged();
  };

  return (
    <Card
      title={item.label}
      custom={item.custom}
      updatedBy={item.updatedBy}
      updatedAt={item.updatedAt}
      dirty={dirty}
      saving={saving}
      error={error}
      justSaved={saved}
      onSave={save}
      onDiscard={discard}
      onRestore={restore}
    >
      <label className={styles.field}>
        Description
        <span className={styles.hint}>What the search is told to look for.</span>
        <textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className={styles.field}>
        Requirements
        <span className={styles.hint}>One per line. Every result must meet all of these.</span>
        <textarea rows={Math.max(4, split(criteria).length + 1)} value={criteria} onChange={(e) => setCriteria(e.target.value)} />
      </label>
      <label className={styles.field}>
        Keywords
        <span className={styles.hint}>One per line. Words and phrases that identify the right companies.</span>
        <textarea rows={Math.max(3, split(keywords).length + 1)} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </label>
      <label className={styles.field}>
        Exclusion terms
        <span className={styles.hint}>One per line. Businesses or company types to leave out.</span>
        <textarea rows={Math.max(3, split(exclusions).length + 1)} value={exclusions} onChange={(e) => setExclusions(e.target.value)} />
      </label>
    </Card>
  );
}

function ExclusionsCard({ item, saved, onChanged }: { item: ExclusionItem; saved: boolean; onChanged: (savedKey?: string) => Promise<void> }) {
  const [text, setText] = useState(item.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await apiFetch("/api/criteria", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: PLATFORM_EXCLUSIONS_KEY, text, expectedUpdatedAt: item.updatedAt }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save");
      if (res.status === 409) await onChanged();
      return;
    }
    await onChanged(PLATFORM_EXCLUSIONS_KEY);
  };

  const restore = async () => {
    if (!window.confirm("Put the shared platform exclusions back to the original text? Your edits are lost for everyone.")) return;
    setSaving(true);
    const res = await apiFetch(`/api/criteria?key=${PLATFORM_EXCLUSIONS_KEY}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not restore");
    await onChanged();
  };

  return (
    <Card
      title="Shared platform exclusions"
      custom={item.custom}
      updatedBy={item.updatedBy}
      updatedAt={item.updatedAt}
      dirty={text !== item.current}
      saving={saving}
      error={error}
      justSaved={saved}
      onSave={save}
      onDiscard={() => setText(item.current)}
      onRestore={restore}
    >
      <label className={styles.field}>
        Added to every platform search
        <span className={styles.hint}>
          Plain instructions, written the way you would tell an analyst. Clear the box to apply no shared exclusions.
        </span>
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
    </Card>
  );
}

export default function CriteriaPage() {
  const [tab, setTab] = useState<SearchType>("addon");
  const [data, setData] = useState<{ type: SearchType; payload: Payload } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  const load = useCallback(async (type: SearchType) => {
    const res = await apiFetch(`/api/criteria?type=${type}`);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Could not load criteria");
    if (type === tabRef.current) {
      setData({ type, payload });
      setError(null);
    }
  }, []);

  useEffect(() => {
    load(tab).catch((e: Error) => setError(e.message));
  }, [tab, load]);

  const reload = async (key?: string) => {
    setSavedKey(key ?? null);
    await load(tab).catch((e: Error) => setError(e.message));
  };
  const payload = data?.type === tab ? data.payload : null;

  return (
    <div className={memory.page}>
      <header className={memory.headerRow}>
        <h1>Search Criteria</h1>
        <Link href="/" className={memory.backLink}>
          &larr; Back to search
        </Link>
      </header>

      <nav className={memory.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.type}
            role="tab"
            aria-selected={tab === t.type}
            className={tab === t.type ? memory.tabActive : memory.tab}
            onClick={() => {
              setTab(t.type);
              setSavedKey(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <p className={memory.intro}>
        This is exactly what each search is told to look for. Edit it here and click Save: the change is shared, so it
        applies to both of your accounts and to the very next search anyone runs. Results already found are not changed.
        Geography (US, Canada or both) is chosen on the main screen when you run a search. Focus area names cannot be
        renamed, because results and memory are filed under them. Restore original puts a focus area back to the text it
        shipped with.
      </p>

      {error && <p className={memory.errorText}>{error}</p>}
      {!payload && !error && <p className={memory.muted}>Loading&hellip;</p>}

      {payload && (
        <>
          {payload.platformExclusions && (
            <ExclusionsCard
              key={`excl-${payload.platformExclusions.updatedAt ?? "shipped"}`}
              item={payload.platformExclusions}
              saved={savedKey === PLATFORM_EXCLUSIONS_KEY}
              onChanged={reload}
            />
          )}
          {payload.items.map((item) => (
            <FocusCard key={`${item.key}-${item.updatedAt ?? "shipped"}`} item={item} saved={savedKey === item.key} onChanged={reload} />
          ))}
        </>
      )}
    </div>
  );
}
