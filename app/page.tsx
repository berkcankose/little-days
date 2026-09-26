"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Countdown = {
  id: string;
  title: string;
  target: string;
};

const DEFAULT: Countdown = {
  id: "new-year-2027",
  title: "2027",
  target: "2027-01-01",
};

const STORAGE_KEY = "little-days-countdowns";

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

export default function Home() {
  const [countdowns, setCountdowns] = useState<Countdown[]>([DEFAULT]);
  const [activeId, setActiveId] = useState(DEFAULT.id);
  const [checked, setChecked] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");

  const active = countdowns.find((item) => item.id === activeId) ?? countdowns[0] ?? DEFAULT;
  const remaining = daysUntil(active.target);
  const today = new Date();
  const targetYear = new Date(active.target + "T00:00:00").getFullYear();

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Countdown[];
        if (Array.isArray(parsed) && parsed.length) {
          setCountdowns(parsed);
          setActiveId(parsed[0].id);
        }
      }
      setChecked(window.localStorage.getItem("little-days-checked") === new Date().toISOString().slice(0, 10));
    } catch {
      // Keep the app usable if storage is unavailable.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(countdowns));
  }, [countdowns]);

  const pastFlowers = useMemo(() => Math.min(42, Math.max(8, 42 - Math.floor(remaining / 10))), [remaining]);

  function toggleCheckin() {
    const todayKey = new Date().toISOString().slice(0, 10);
    const next = !checked;
    setChecked(next);
    if (next) {
      window.localStorage.setItem("little-days-checked", todayKey);
      setToast("A little mark for today.");
    } else {
      window.localStorage.removeItem("little-days-checked");
      setToast("Today is open again.");
    }
    window.setTimeout(() => setToast(""), 1800);
  }

  function addCountdown(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const target = String(form.get("target") || "");
    if (!title || !target) return;

    const item = { id: crypto.randomUUID(), title, target };
    setCountdowns((current) => [...current, item]);
    setActiveId(item.id);
    setShowAdd(false);
    event.currentTarget.reset();
    setToast("A new little day was planted.");
    window.setTimeout(() => setToast(""), 1800);
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
              <button className={`check-button ${checked ? "checked" : ""}`} onClick={toggleCheckin}>
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
                <button
                  key={item.id}
                  className="countdown-row"
                  onClick={() => setActiveId(item.id)}
                  style={{ border: 0, background: "transparent", textAlign: "left", width: "100%" }}
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
                </button>
              ))}
            </div>

            {showAdd && (
              <div className="add-panel">
                <form className="add-form" onSubmit={addCountdown}>
                  <input className="input" name="title" placeholder="What are you waiting for?" required />
                  <input className="input" name="target" type="date" required />
                  <button className="primary-button" type="submit">Plant it</button>
                </form>
                <div className="helper">For now, Little Days keeps your data on this device. Cloud sync is wired through Supabase next.</div>
              </div>
            )}
          </article>
        </section>

        <footer className="footer">
          <span>Little Days · a small ritual around time</span>
          <span>Made for two people who keep choosing each other.</span>
        </footer>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}