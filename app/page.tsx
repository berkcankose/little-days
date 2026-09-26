"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Countdown = {
  id: string;
  title: string;
  target: string;
};

const DEFAULT: Omit<Countdown, "id"> = {
  title: "2027",
  target: "2027-01-01",
};

const STORAGE_KEY = "little-days-countdowns";
const CHECKED_KEY = "little-days-checked";

function localDateKey() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function daysUntil(target: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(target + "T00:00:00");
  return Math.max(0, Math.ceil((date.getTime() - today.getTime()) / 86400000));
}

function prettyDate(target: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(target + "T00:00:00"));
}

function getLocalCountDowns(): Omit<Countdown, "id">[] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [DEFAULT];

    const parsed = JSON.parse(saved) as Countdown[];
    if (!Array.isArray(parsed) || !parsed.length) return [DEFAULT];

    return parsed
      .filter((item) => item && typeof item.title === "string" && typeof item.target === "string")
      .map(({ title, target }) => ({ title, target }));
  } catch {
    return [DEFAULT];
  }
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [activeId, setActiveId] = useState("");
  const [checked, setChecked] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const active = countdowns.find((item) => item.id === activeId) ?? countdowns[0];
  const remaining = active ? daysUntil(active.target) : 0;
  const today = new Date();
  const targetYear = active ? new Date(active.target + "T00:00:00").getFullYear() : today.getFullYear();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        window.location.href = "/auth";
        return;
      }

      const { data, error } = await supabase
        .from("countdowns")
        .select("id,title,target_date")
        .order("created_at", { ascending: true });

      if (error) {
        setToast(error.message);
        setLoading(false);
        return;
      }

      let rows = (data ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        target: item.target_date,
      }));

      if (!rows.length) {
        const localItems = getLocalCountDowns();
        const { data: created, error: createError } = await supabase
          .from("countdowns")
          .insert(localItems.map((item) => ({
            user_id: user.id,
            title: item.title,
            target_date: item.target,
          })))
          .select("id,title,target_date");

        if (createError) {
          setToast(createError.message);
          setLoading(false);
          return;
        }

        rows = (created ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          target: item.target_date,
        }));

        if (window.localStorage.getItem(CHECKED_KEY) === localDateKey() && rows[0]) {
          await supabase.from("check_ins").upsert(
            {
              countdown_id: rows[0].id,
              user_id: user.id,
              check_date: localDateKey(),
            },
            { onConflict: "countdown_id,check_date" },
          );
        }
      }

      if (cancelled) return;

      setCountdowns(rows);
      setActiveId(rows[0]?.id ?? "");

      if (rows[0]) {
        const { data: checkIn } = await supabase
          .from("check_ins")
          .select("id")
          .eq("countdown_id", rows[0].id)
          .eq("check_date", localDateKey())
          .maybeSingle();

        if (!cancelled) setChecked(Boolean(checkIn));
      }

      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const pastFlowers = useMemo(
    () => Math.min(42, Math.max(8, 42 - Math.floor(remaining / 10))),
    [remaining],
  );

  async function toggleCheckin() {
    if (!active || busy) return;

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const next = !checked;
    setBusy(true);

    if (next) {
      const { error } = await supabase.from("check_ins").upsert(
        {
          countdown_id: active.id,
          user_id: user.id,
          check_date: localDateKey(),
        },
        { onConflict: "countdown_id,check_date" },
      );

      if (error) {
        setToast(error.message);
      } else {
        setChecked(true);
        window.localStorage.setItem(CHECKED_KEY, localDateKey());
        setToast("A little mark for today.");
      }
    } else {
      const { error } = await supabase
        .from("check_ins")
        .delete()
        .eq("countdown_id", active.id)
        .eq("check_date", localDateKey());

      if (error) {
        setToast(error.message);
      } else {
        setChecked(false);
        window.localStorage.removeItem(CHECKED_KEY);
        setToast("Today is open again.");
      }
    }

    setBusy(false);
    window.setTimeout(() => setToast(""), 1800);
  }

  async function selectCountdown(id: string) {
    setActiveId(id);

    const { data: checkIn } = await supabase
      .from("check_ins")
      .select("id")
      .eq("countdown_id", id)
      .eq("check_date", localDateKey())
      .maybeSingle();

    setChecked(Boolean(checkIn));
  }

  async function addCountdown(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const target = String(form.get("target") || "");
    if (!title || !target || busy) return;

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    setBusy(true);

    const { data, error } = await supabase
      .from("countdowns")
      .insert({
        user_id: user.id,
        title,
        target_date: target,
      })
      .select("id,title,target_date")
      .single();

    if (error) {
      setToast(error.message);
      setBusy(false);
      return;
    }

    const item = {
      id: data.id,
      title: data.title,
      target: data.target_date,
    };

    setCountdowns((current) => [...current, item]);
    setActiveId(item.id);
    setChecked(false);
    setShowAdd(false);
    event.currentTarget.reset();
    setBusy(false);
    setToast("A new little day was planted.");
    window.setTimeout(() => setToast(""), 1800);
  }

  async function deleteCountdown(id: string) {
    if (busy || countdowns.length <= 1) return;

    const item = countdowns.find((countdown) => countdown.id === id);
    if (!item || !window.confirm(`Remove “${item.title}” from your garden?`)) return;

    setBusy(true);

    const { error } = await supabase.from("countdowns").delete().eq("id", id);

    if (error) {
      setToast(error.message);
      setBusy(false);
      return;
    }

    const remainingItems = countdowns.filter((countdown) => countdown.id !== id);
    setCountdowns(remainingItems);

    if (id === activeId) {
      setActiveId(remainingItems[0]?.id ?? "");
      setChecked(false);
    }

    setBusy(false);
    setToast("That little day was removed.");
    window.setTimeout(() => setToast(""), 1800);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  if (loading) {
    return (
      <main className="app-shell">
        <div className="app-frame">
          <div className="card loading-card">Growing your little garden…</div>
        </div>
      </main>
    );
  }

  if (!active) {
    return null;
  }

  return (
    <main className="app-shell">
      <div className="app-frame">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">✿</span>
            <span>Little Days</span>
          </div>
          <nav className="nav-pills" aria-label="Main navigation">
            <button className="active">Today</button>
            <button onClick={() => document.getElementById("garden")?.scrollIntoView({ behavior: "smooth" })}>Garden</button>
            <button onClick={() => document.getElementById("little-days")?.scrollIntoView({ behavior: "smooth" })}>Little days</button>
          </nav>
          <button className="ghost-button" onClick={() => setShowAdd((value) => !value)}>+ New</button>
        </header>

        <section className="hero">
          <article className="card hero-main">
            <div>
              <span className="eyebrow"><span>●</span> counting softly</span>
              <h1 className="hero-title">{active.title}</h1>
              <p className="hero-subtitle">
                Time is moving. This is just a small place to notice it — one day, one flower, one little mark at a time.
              </p>
            </div>

            <div className="hero-bottom">
              <div>
                <div className="days-label">days left</div>
                <div className="days-value">{remaining}</div>
              </div>
              <div className="target">
                <div className="target-year">{targetYear}</div>
                <div className="target-date">{prettyDate(active.target)}</div>
              </div>
            </div>
          </article>

          <article className="card garden-card" id="garden">
            <div className="garden-head">
              <div>
                <span className="eyebrow">your little garden</span>
                <h2>Every day leaves a flower.</h2>
                <p>Today is the little bud in the middle.</p>
              </div>
              <span className="eyebrow">{remaining} to go</span>
            </div>

            <div className="garden" aria-label="Visual countdown garden">
              {Array.from({ length: 49 }, (_, index) => {
                const isDone = index < pastFlowers;
                const isToday = index === pastFlowers;
                return (
                  <div
                    className={`flower ${isDone ? "done" : isToday ? "today" : "future"}`}
                    key={index}
                    title={isToday ? "Today" : isDone ? "A day that passed" : "A day ahead"}
                  >
                    <span className="flower-dot" />
                    <span className="flower-number">{index + 1}</span>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <section className="content-grid">
          <article className="card section-card">
            <div className="section-head">
              <h2>Today</h2>
              <span>{today.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}</span>
            </div>
            <div className="checkin">
              <div className="checkin-copy">
                <strong>Did you notice today?</strong>
                <p>A tiny check-in is enough. There is nothing to write.</p>
              </div>
              <button className={`check-button ${checked ? "checked" : ""}`} onClick={toggleCheckin} disabled={busy}>
                {checked ? "✓ Marked today" : "Mark today"}
              </button>
            </div>
          </article>

          <article className="card section-card" id="little-days">
            <div className="section-head">
              <h2>Little days</h2>
              <span>{countdowns.length} {countdowns.length === 1 ? "memory" : "memories"}</span>
            </div>

            <div className="list">
              {countdowns.map((item) => (
                <div
                  key={item.id}
                  className={`countdown-row ${item.id === active.id ? "selected" : ""}`}
                  onClick={() => selectCountdown(item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") selectCountdown(item.id);
                  }}
                >
                  <span className="row-flower">✿</span>
                  <span className="row-main">
                    <strong>{item.title}</strong>
                    <span>{prettyDate(item.target)}</span>
                  </span>
                  <span className="row-days">
                    {daysUntil(item.target)}
                    <small>days</small>
                  </span>
                  {countdowns.length > 1 && (
                    <button
                      className="row-delete"
                      aria-label={`Remove ${item.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteCountdown(item.id);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {showAdd && (
              <div className="add-panel">
                <form className="add-form" onSubmit={addCountdown}>
                  <input className="input" name="title" placeholder="What are you waiting for?" required />
                  <input className="input" name="target" type="date" required />
                  <button className="primary-button" type="submit" disabled={busy}>
                    {busy ? "Planting…" : "Plant it"}
                  </button>
                </form>
                <div className="helper">Your little days now live in your private Supabase garden and follow your account.</div>
              </div>
            )}
          </article>
        </section>

        <footer className="footer">
          <span>Little Days · a small ritual around time</span>
          <button className="footer-signout" onClick={signOut}>Sign out</button>
          <span>Made for two people who keep choosing each other.</span>
        </footer>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
