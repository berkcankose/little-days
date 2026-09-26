"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
            },
          });

    if (result.error) {
      setMessage(result.error.message);
      setBusy(false);
      return;
    }

    if (mode === "signup") {
      setMessage("Check your email to confirm your account, then come back here.");
      setBusy(false);
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-mark">✿</div>
        <span className="eyebrow">little days</span>
        <h1>{mode === "signin" ? "Welcome back." : "Plant your garden."}</h1>
        <p className="auth-copy">
          A small private place for the days you are counting together.
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {message && <p className="auth-message">{message}</p>}

        <button
          className="auth-switch"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage("");
          }}
        >
          {mode === "signin" ? "Create a new account" : "I already have an account"}
        </button>
      </section>
    </main>
  );
}
