"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import styles from "../auth.module.css";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Could not reset the password.");
      else setDone(true);
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  };

  if (!token) {
    return (
      <div className={styles.card}>
        <p className={styles.brand}>Rockwood Equity Partners</p>
        <h1 className={styles.title}>Reset your password</h1>
        <p className={styles.error}>This reset link is incomplete. Use the link from your email, or request a new one.</p>
        <div className={styles.links}>
          <Link href="/forgot-password">Request a new link</Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.card}>
        <p className={styles.brand}>Rockwood Equity Partners</p>
        <h1 className={styles.title}>Password updated</h1>
        <p className={styles.notice}>Your password has been changed. You can sign in with it now.</p>
        <Link href="/login" className={styles.button} style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <p className={styles.brand}>Rockwood Equity Partners</p>
      <h1 className={styles.title}>Choose a new password</h1>
      <p className={styles.sub}>Enter your new password twice.</p>
      {error && <p className={styles.error}>{error}</p>}
      <label className={styles.field}>
        New password
        <input
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <p className={styles.hint}>At least 12 characters, mixing at least three of: lowercase, uppercase, numbers, symbols.</p>
      <label className={styles.field}>
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <button className={styles.button} type="submit" disabled={busy}>
        {busy ? "Saving…" : "Set new password"}
      </button>
      <div className={styles.links}>
        <Link href="/login">Back to sign in</Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className={styles.wrap}>
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
