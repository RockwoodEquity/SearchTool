"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "../auth.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"sent" | "no_email" | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else setResult(data.emailConfigured === false ? "no_email" : "sent");
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={submit}>
        <p className={styles.brand}>Rockwood Equity Partners</p>
        <h1 className={styles.title}>Reset your password</h1>

        {result === "sent" && (
          <p className={styles.notice}>
            If that email has an account, a reset link is on its way. It works once and expires in 1 hour. Check your inbox
            and spam folder.
          </p>
        )}
        {result === "no_email" && (
          <p className={styles.warnNotice}>
            Password reset emails are not set up yet. Ask the other person on the team to reset it, or contact the tool&rsquo;s
            administrator.
          </p>
        )}
        {error && <p className={styles.error}>{error}</p>}

        {result === null && (
          <>
            <p className={styles.sub}>Enter your email and we&rsquo;ll send you a link to choose a new password.</p>
            <label className={styles.field}>
              Email
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className={styles.button} type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}
        <div className={styles.links}>
          <Link href="/login">Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
