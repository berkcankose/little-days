"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "until" | "since";
type TimeItem = { id: string; title: string; target: string; mode: Mode };
type Habit = { id: string; title: string; frequency: "daily" | "weekdays"; icon: string };

const DEFAULT: TimeItem = { id: "", title: "2027", target: "2027-01-01", mode: "until" };
const STORAGE_KEY = "little-days-time-items";
const HABITS_KEY = "little-days-habits";
const HABIT_LOGS_KEY = "little-days-habit-logs";
const MODE_KEY = "little-days-modes";
const MARKS_KEY = "little-days-marked-dates";

const DEFAULT_HABITS: Habit[] = [
  { id: "habit-run", title: "Move your body", frequency: "daily", icon: "○" },
  { id: "habit-read", title: "Read", frequency: "daily", icon: "○" },
];

function dateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function parseDate(value: string) {
  return new Date(value + "T00:00:00");
}

function daysUntil(target: string) {
  const today = parseDate(dateKey());
  const targetDate = parseDate(target);
  return Math.max(0, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000));
}

function daysSince(target: string) {
  const today = parseDate(dateKey());
  const start = parseDate(target);
  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
}

function prettyDate(target: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(parseDate(target));
}

function gardenDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function shiftDate(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function gardenDayKey(date: Date) {
  return dateKey(date);
}

function yearProgress() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  const passed = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
  const total = Math.round((end.getTime() - start.getTime()) / 86400000);
  return { year: now.getFullYear(), passed, total, percent: Math.round((passed / total) * 100) };
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local cache is optional.
  }
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<TimeItem[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState("");
  const [markedDates, setMarkedDates] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"until" | "since" | "habit">("until");
  const [view, setView] = useState<"today" | "track" | "garden">("today");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cloudHabitsReady, setCloudHabitsReady] = useState(false);
  const [selectedGardenDate, setSelectedGardenDate] = useState<string | null>(null);

  const active = items.find((item) => item.id === activeId) ?? items[0];
  const progress = useMemo(yearProgress, []);
  const favorite = active ?? DEFAULT;
  const favoriteDays = favorite.mode === "since" ? daysSince(favorite.target) : daysUntil(favorite.target);
  const todayKey = dateKey();

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  function scrollTo(id: string, nextView: "today" | "track" | "garden") {
    setView(nextView);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const user = userData.user;
        if (!user) {
          window.location.href = "/auth";
          return;
        }

        const localHabits = loadJson<Habit[]>(HABITS_KEY, DEFAULT_HABITS);
        const localLogs = loadJson<Record<string, string[]>>(HABIT_LOGS_KEY, {});
        const localMarks = loadJson<string[]>(MARKS_KEY, []);
        setHabits(localHabits);
        setHabitLogs(localLogs);
        setMarkedDates(localMarks);

        const { data: cloudHabits, error: habitError } = await supabase
          .from("habit_items")
          .select("id,title,frequency,icon")
          .order("created_at", { ascending: true });

        if (!habitError && cloudHabits) {
          setCloudHabitsReady(true);
          setHabits(cloudHabits.map((habit) => ({
            id: habit.id,
            title: habit.title,
            frequency: habit.frequency === "weekdays" ? "weekdays" : "daily",
            icon: habit.icon || "○",
          })));

          const { data: cloudLogs } = await supabase
            .from("habit_logs")
            .select("habit_id,log_date");

          const nextLogs: Record<string, string[]> = {};
          (cloudLogs ?? []).forEach((log) => {
            nextLogs[log.habit_id] = [...(nextLogs[log.habit_id] ?? []), log.log_date];
          });
          setHabitLogs(nextLogs);
        }

        const { data: timeData, error: timeError } = await supabase
          .from("time_items")
          .select("id,title,target_date,mode")
          .order("created_at", { ascending: true });

        let loadedItems: TimeItem[] = [];

        if (!timeError && timeData) {
          loadedItems = timeData.map((item) => ({
            id: item.id,
            title: item.title,
            target: item.target_date,
            mode: item.mode === "since" ? "since" : "until",
          }));
        } else {
          const { data, error } = await supabase
            .from("countdowns")
            .select("id,title,target_date")
            .order("created_at", { ascending: true });

          if (error) throw error;

          const modes = loadJson<Record<string, Mode>>(MODE_KEY, {});
          loadedItems = (data ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            target: item.target_date,
            mode: modes[item.id] ?? "until",
          }));
        }

        if (!loadedItems.length) {
          const localItems = loadJson<TimeItem[]>(STORAGE_KEY, []);
          if (localItems.length) {
            loadedItems = localItems.map((item) => ({ ...item, id: item.id || crypto.randomUUID() }));
          } else {
            const { data, error } = await supabase
              .from("countdowns")
              .insert({ user_id: user.id, title: DEFAULT.title, target_date: DEFAULT.target })
              .select("id,title,target_date")
              .single();

            if (error) throw error;
            loadedItems = [{ id: data.id, title: data.title, target: data.target_date, mode: "until" }];
          }
        }

        if (cancelled) return;

        setItems(loadedItems);
        setActiveId(loadedItems[0]?.id ?? "");

        const { data: cloudMarks, error: marksError } = await supabase
          .from("daily_marks")
          .select("mark_date")
          .order("mark_date", { ascending: true });

        let loadedMarks: string[] = [];

        if (!marksError && cloudMarks) {
          loadedMarks = [...new Set([...localMarks, ...cloudMarks.map((mark) => mark.mark_date)])];
        } else if (loadedItems[0]) {
          const { data: legacyMarks } = await supabase
            .from("check_ins")
            .select("check_date")
            .order("check_date", { ascending: true });

          loadedMarks = [...new Set([...localMarks, ...(legacyMarks ?? []).map((mark) => mark.check_date)])];
        } else {
          loadedMarks = localMarks;
        }

        if (!cancelled) {
          setMarkedDates(loadedMarks);
          saveJson(MARKS_KEY, loadedMarks);
        }

        saveJson(STORAGE_KEY, loadedItems);
      } catch (error) {
        if (!cancelled) {
          setToast(error instanceof Error ? error.message : "Something went wrong while growing your garden.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, todayKey]);

  useEffect(() => {
    if (habits.length) saveJson(HABITS_KEY, habits);
    saveJson(HABIT_LOGS_KEY, habitLogs);
  }, [habits, habitLogs]);

  function selectItem(id: string) {
    setActiveId(id);
  }

  async function toggleCheckin() {
    if (!active || busy) return;
    const previous = markedDates.includes(todayKey);
    const optimistic = previous
      ? markedDates.filter((day) => day !== todayKey)
      : [...markedDates, todayKey].sort();
    setMarkedDates(optimistic);
    saveJson(MARKS_KEY, optimistic);
    setBusy(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Your session has expired.");

      const { data: dailyMark, error: dailyMarkError } = await supabase
        .from("daily_marks")
        .select("id")
        .eq("mark_date", todayKey)
        .maybeSingle();

      if (!dailyMarkError) {
        if (!previous) {
          const { error } = await supabase.from("daily_marks").upsert(
            { user_id: user.id, mark_date: todayKey },
            { onConflict: "user_id,mark_date" },
          );
          if (error) throw error;
          flash("Today grew a little.");
        } else if (dailyMark) {
          const { error } = await supabase.from("daily_marks").delete().eq("id", dailyMark.id);
          if (error) throw error;
          flash("Today is open again.");
        }
      } else if (!previous) {
        const { error } = await supabase.from("check_ins").upsert(
          { countdown_id: active.id, user_id: user.id, check_date: todayKey },
          { onConflict: "countdown_id,check_date" },
        );
        if (error) throw error;
        flash("Today grew a little.");
      } else {
        const { error } = await supabase
          .from("check_ins")
          .delete()
          .eq("countdown_id", active.id)
          .eq("check_date", todayKey);
        if (error) throw error;
        flash("Today is open again.");
      }
    } catch (error) {
      setMarkedDates(markedDates);
      saveJson(MARKS_KEY, markedDates);
      flash(error instanceof Error ? error.message : "Could not save today's mark.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHabit(id: string) {
    const previous = habitLogs[id] ?? [];
    const complete = previous.includes(todayKey);
    const next = complete ? previous.filter((day) => day !== todayKey) : [...previous, todayKey];
    setHabitLogs((current) => ({ ...current, [id]: next }));

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Your session has expired.");

      if (cloudHabitsReady) {
        if (!complete) {
          const { error } = await supabase.from("habit_logs").upsert(
            { habit_id: id, user_id: user.id, log_date: todayKey },
            { onConflict: "habit_id,log_date" },
          );
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("habit_logs")
            .delete()
            .eq("habit_id", id)
            .eq("log_date", todayKey);
          if (error) throw error;
        }
      }
    } catch (error) {
      setHabitLogs((current) => ({ ...current, [id]: previous }));
      flash(error instanceof Error ? error.message : "Could not save this habit.");
      return;
    }

    flash(complete ? "Today is open again." : "Checked off. Nice.");
  }

  async function addThing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
    const target = String(form.get("target") || "");
    const icon = String(form.get("icon") || "○").trim() || "○";
    const frequency = String(form.get("frequency") || "daily") as Habit["frequency"];

    if (!title || (addMode !== "habit" && !target)) return;

    setBusy(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Your session has expired.");

      if (addMode === "habit") {
        const temp: Habit = { id: crypto.randomUUID(), title, frequency, icon };
        setHabits((current) => [...current, temp]);

        if (cloudHabitsReady) {
          const { data, error } = await supabase
            .from("habit_items")
            .insert({ user_id: user.id, title, frequency, icon })
            .select("id,title,frequency,icon")
            .single();

          if (error) throw error;
          if (data) {
            setHabits((current) => current.map((item) => item.id === temp.id ? { ...item, id: data.id } : item));
          }
        }

        setShowAdd(false);
        formElement.reset();
        flash("A new little habit was planted.");
        return;
      }

      const mode = addMode;
      const optimistic: TimeItem = { id: crypto.randomUUID(), title, target, mode };
      setItems((current) => [...current, optimistic]);
      setActiveId(optimistic.id);

      const { data, error } = await supabase
        .from("time_items")
        .insert({ user_id: user.id, title, target_date: target, mode })
        .select("id,title,target_date,mode")
        .single();

      if (!error && data) {
        setItems((current) => current.map((item) => item.id === optimistic.id ? {
          id: data.id, title: data.title, target: data.target_date, mode: data.mode === "since" ? "since" : "until",
        } : item));
        setActiveId(data.id);
      } else if (error && mode === "until") {
        const { data: fallback, error: fallbackError } = await supabase
          .from("countdowns")
          .insert({ user_id: user.id, title, target_date: target })
          .select("id,title,target_date")
          .single();

        if (fallbackError) throw fallbackError;
        setItems((current) => current.map((item) => item.id === optimistic.id ? {
          id: fallback.id, title: fallback.title, target: fallback.target_date, mode: "until",
        } : item));
        setActiveId(fallback.id);
      } else if (error) {
        throw error;
      }

      setShowAdd(false);
      formElement.reset();
      flash(mode === "since" ? "A little memory was planted." : "A new little day was planted.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not plant that yet.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(id: string) {
    if (busy || items.length <= 1) return;
    const item = items.find((entry) => entry.id === id);
    if (!item || !window.confirm(`Remove “${item.title}” from your garden?`)) return;

    const previous = items;
    const next = items.filter((entry) => entry.id !== id);
    setItems(next);
    if (id === activeId) {
      setActiveId(next[0]?.id ?? "");
    }

    try {
      const { error } = await supabase.from("time_items").delete().eq("id", id);
      if (error) {
        const fallback = await supabase.from("countdowns").delete().eq("id", id);
        if (fallback.error) throw error;
      }
      flash("That little day was removed.");
    } catch (error) {
      setItems(previous);
      flash(error instanceof Error ? error.message : "Could not remove that item.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  function openAdd(mode: "until" | "since" | "habit") {
    setAddMode(mode);
    setShowAdd(true);
  }

  const completedHabits = habits.filter((habit) => (habitLogs[habit.id] ?? []).includes(todayKey)).length;
  const todayMarked = markedDates.includes(todayKey);
  const gardenFlowers = markedDates.length;
  const gardenDays = Array.from({ length: 49 }, (_, index) => shiftDate(parseDate(todayKey), index - 24));
  const selectedGarden = selectedGardenDate ? parseDate(selectedGardenDate) : null;
  const selectedGardenMarked = selectedGardenDate ? markedDates.includes(selectedGardenDate) : false;
  const selectedGardenIsToday = selectedGardenDate === todayKey;

  if (loading) {
    return <main className="app-shell"><div className="app-frame"><div className="card loading-card"><span className="loading-flower">✿</span>Growing your little garden…</div></div></main>;
  }

  return (
    <main className="app-shell">
      <div className="app-frame">
        <header className="topbar">
          <button className="brand brand-button" type="button" onClick={() => scrollTo("today", "today")} aria-label="Go to today">
            <span className="brand-mark">✿</span><span>Little Days</span>
          </button>

          <nav className="nav-pills" aria-label="Main navigation">
            <button className={view === "today" ? "active" : ""} type="button" onClick={() => scrollTo("today", "today")}>Today</button>
            <button className={view === "track" ? "active" : ""} type="button" onClick={() => scrollTo("track", "track")}>Track</button>
            <button className={view === "garden" ? "active" : ""} type="button" onClick={() => scrollTo("garden", "garden")}>Garden</button>
          </nav>

          <button className="ghost-button" type="button" onClick={() => setShowAdd(true)}>+ Add</button>
        </header>

        <section className="dashboard" id="today">
          <article className="card year-card">
            <div className="card-kicker">this year</div>
            <div className="year-number">{progress.year}</div>
            <div className="progress-ring" style={{ "--progress": progress.percent } as CSSProperties}>
              <div><strong>{progress.percent}%</strong><span>of the year</span></div>
            </div>
            <div className="year-meta"><span>{progress.passed} days passed</span><span>{progress.total - progress.passed} days ahead</span></div>
          </article>

          <article className="card favorite-card">
            <div className="favorite-top">
              <div>
                <div className="card-kicker">{favorite.mode === "since" ? "since" : "until"}</div>
                <h1>{favorite.title}</h1>
              </div>
              <span className="favorite-icon">✿</span>
            </div>
            <div className="favorite-days"><strong>{favoriteDays}</strong><span>{favorite.mode === "since" ? "days since" : "days to go"}</span></div>
            <div className="favorite-bottom"><span>{prettyDate(favorite.target)}</span><button type="button" onClick={() => openAdd("until")}>+ another</button></div>
          </article>
        </section>

        <section className="daily-grid">
          <article className="card section-card" id="track">
            <div className="section-head"><div><div className="card-kicker">your time</div><h2>Until & Since</h2></div><button className="text-button" type="button" onClick={() => openAdd("until")}>+ Add</button></div>

            <div className="segmented">
              <span>Upcoming</span><span>Memories</span>
            </div>

            <div className="time-list">
              {items.map((item) => {
                const value = item.mode === "since" ? daysSince(item.target) : daysUntil(item.target);
                return (
                  <div className={`time-row ${item.id === active.id ? "selected" : ""}`} key={item.id}>
                    <button className="time-select" type="button" onClick={() => selectItem(item.id)}>
                      <span className="time-icon">{item.mode === "since" ? "↗" : "✿"}</span>
                      <span className="time-copy"><strong>{item.title}</strong><small>{item.mode === "since" ? `since ${prettyDate(item.target)}` : prettyDate(item.target)}</small></span>
                      <span className="time-value"><strong>{value}</strong><small>{item.mode === "since" ? "days" : "left"}</small></span>
                    </button>
                    {items.length > 1 && <button className="row-delete" type="button" aria-label={`Remove ${item.title}`} onClick={() => deleteItem(item.id)}>×</button>}
                  </div>
                );
              })}
            </div>
          </article>

          <article className="card section-card">
            <div className="section-head"><div><div className="card-kicker">today</div><h2>Little habits</h2></div><button className="text-button" type="button" onClick={() => openAdd("habit")}>+ Add</button></div>
            <div className="habit-progress"><strong>{completedHabits}/{habits.length}</strong><span>little things done</span></div>
            <div className="habit-list">
              {habits.map((habit) => {
                const done = (habitLogs[habit.id] ?? []).includes(todayKey);
                return (
                  <button className={`habit-row ${done ? "done" : ""}`} type="button" key={habit.id} onClick={() => toggleHabit(habit.id)}>
                    <span className="habit-check">{done ? "✓" : habit.icon}</span><span><strong>{habit.title}</strong><small>{habit.frequency === "daily" ? "every day" : "weekdays"}</small></span>
                  </button>
                );
              })}
            </div>
            <p className="soft-note">One tap. No streak pressure. Just a small mark that today happened.</p>
          </article>
        </section>

        <section className="card daily-mark-card">
          <div>
            <div className="card-kicker">one little thing</div>
            <h2>Did you notice today?</h2>
            <p>There is no streak to protect. Just a tiny mark that this day happened.</p>
          </div>
          <button className={`check-button daily-mark-button ${todayMarked ? "checked" : ""}`} type="button" onClick={toggleCheckin} disabled={busy}>
            {todayMarked ? "✓ Marked today" : "Mark today"}
          </button>
        </section>

        <section className="card garden-card large-garden" id="garden">
          <div className="garden-head">
            <div><div className="card-kicker">your little garden</div><h2>Every day leaves something behind.</h2><p>Past days become flowers. Today is a bud. Tomorrow is still a seed.</p></div>
            <span className="garden-count">{gardenFlowers} marked days</span>
          </div>
          <div className="garden-legend" aria-label="Garden legend">
            <span><i className="legend-flower" /> remembered</span>
            <span><i className="legend-bud" /> today</span>
            <span><i className="legend-seed" /> ahead</span>
          </div>
          <div className="garden large" aria-label="Little garden calendar">
            {gardenDays.map((day) => {
              const key = gardenDayKey(day);
              const isMarked = markedDates.includes(key);
              const isToday = key === todayKey;
              const isFuture = day.getTime() > parseDate(todayKey).getTime();
              const state = isToday ? "today" : isMarked ? "done" : isFuture ? "future" : "past";
              const palette = ["rose", "blue", "lavender", "sun", "green"][day.getDate() % 5];
              return (
                <button
                  className={`flower ${state} flower-${palette} ${selectedGardenDate === key ? "selected" : ""}`}
                  key={key}
                  type="button"
                  onClick={() => setSelectedGardenDate(key)}
                  aria-label={`${gardenDateLabel(day)} — ${isToday ? "today" : isMarked ? "marked" : isFuture ? "future" : "not marked"}`}
                >
                  <span className="flower-number">{gardenDateLabel(day)}</span>
                  <span className="flower-dot" />
                  {isToday && <span className="flower-today-label">today</span>}
                </button>
              );
            })}
          </div>
          {selectedGarden && (
            <div className="garden-day-detail" aria-live="polite">
              <div>
                <span className="card-kicker">{selectedGardenIsToday ? "today" : selectedGardenMarked ? "remembered" : selectedGarden && selectedGarden.getTime() > parseDate(todayKey).getTime() ? "not here yet" : "a quiet day"}</span>
                <strong>{gardenDateLabel(selectedGarden)}</strong>
                <p>
                  {selectedGardenIsToday
                    ? selectedGardenMarked ? "You noticed today. Keep it small." : "Today is still a bud. You can mark it when you are ready."
                    : selectedGardenMarked
                      ? "You marked this day. A little day remembered."
                      : selectedGarden.getTime() > parseDate(todayKey).getTime()
                        ? "This day is still waiting for you."
                        : "No mark was left. That is okay."}
                </p>
              </div>
              {selectedGardenIsToday && (
                <button className={`check-button ${selectedGardenMarked ? "checked" : ""}`} type="button" onClick={toggleCheckin} disabled={busy}>
                  {selectedGardenMarked ? "✓ Marked today" : "Mark today"}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="more-strip">
          <button type="button" onClick={() => openAdd("until")}><span>⌁</span><strong>Countdown</strong><small>birthday, Japan, events</small></button>
          <button type="button" onClick={() => openAdd("since")}><span>↗</span><strong>Days since</strong><small>the moments that began it</small></button>
          <button type="button" onClick={() => openAdd("habit")}><span>✓</span><strong>Habit</strong><small>one tiny tick each day</small></button>
          <button type="button" onClick={() => scrollTo("garden", "garden")}><span>✿</span><strong>Garden</strong><small>watch time grow</small></button>
        </section>

        <footer className="footer">
          <span>Little Days · a small ritual around time</span>
          <button className="footer-signout" type="button" onClick={signOut}>Sign out</button>
          <span>Made for two people who keep choosing each other.</span>
        </footer>
      </div>

      {showAdd && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}>
          <section className="add-modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <div className="modal-top"><div><div className="card-kicker">plant something</div><h2 id="add-title">What would you like to keep track of?</h2></div><button className="modal-close" type="button" onClick={() => setShowAdd(false)} aria-label="Close">×</button></div>

            <div className="type-picker">
              <button type="button" className={addMode === "until" ? "active" : ""} onClick={() => setAddMode("until")}><strong>Until</strong><small>A date ahead</small></button>
              <button type="button" className={addMode === "since" ? "active" : ""} onClick={() => setAddMode("since")}><strong>Since</strong><small>A day that began</small></button>
              <button type="button" className={addMode === "habit" ? "active" : ""} onClick={() => setAddMode("habit")}><strong>Habit</strong><small>A thing to tick</small></button>
            </div>

            <form className="add-form modal-form" onSubmit={addThing}>
              <label><span>Name</span><input className="input" name="title" placeholder={addMode === "habit" ? "e.g. Run" : addMode === "since" ? "e.g. Our wedding" : "e.g. Japan"} required /></label>
              {addMode !== "habit" && <label><span>Date</span><input className="input" name="target" type="date" required /></label>}
              {addMode === "habit" && <div className="habit-form-grid"><label><span>Frequency</span><select className="input" name="frequency" defaultValue="daily"><option value="daily">Every day</option><option value="weekdays">Weekdays</option></select></label><label><span>Symbol</span><input className="input" name="icon" defaultValue="○" maxLength={2} /></label></div>}
              <button className="primary-button" type="submit" disabled={busy}>{busy ? "Planting…" : "Plant it"}</button>
            </form>
            <p className="modal-note">You can keep it simple now and personalize it later with colors, notes, photos, reminders and widgets.</p>
          </section>
        </div>
      )}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button type="button" className={view === "today" ? "active" : ""} onClick={() => scrollTo("today", "today")}><span>⌂</span>Today</button>
        <button type="button" className={view === "track" ? "active" : ""} onClick={() => scrollTo("track", "track")}><span>◌</span>Track</button>
        <button type="button" className="mobile-add" onClick={() => setShowAdd(true)}>+</button>
        <button type="button" className={view === "garden" ? "active" : ""} onClick={() => scrollTo("garden", "garden")}><span>✿</span>Garden</button>
        <button type="button" onClick={signOut}><span>↗</span>Exit</button>
      </nav>

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
