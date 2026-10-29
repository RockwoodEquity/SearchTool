"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, type Me } from "@/lib/client";
import styles from "../auth.module.css";

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (password !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, password, confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Could not change the password.");
      else {
        setSaved(true);
        setCurrent("");
        setPassword("");
        setConfirm("");
      }
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={submit}>
        <p className={styles.brand}>Rockwood Equity Partners</p>
        <h1 className={styles.title}>Your account</h1>
        <p className={styles.sub}>{me ? `${me.name} · ${me.email}` : "Loading…"}</p>

        {saved && <p className={styles.notice}>Password changed. Any other devices you were signed in on have been signed out.</p>}
        {error && <p className={styles.error}>{error}</p>}

        <label className={styles.field}>
          Current password
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className={styles.field}>
          New password
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <p className={styles.hint}>At least 12 characters, mixing at least three of: lowercase, uppercase, numbers, symbols.</p>
        <label className={styles.field}>
          Confirm new password
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button className={styles.button} type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
        <div className={styles.links}>
          <Link href="/">&larr; Back to search</Link>
        </div>
      </form>
    </div>
  );
}
