"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "until" | "since";
type Recurrence = "once" | "annual";
type View = "today" | "ahead" | "since" | "garden";
type AddMode = "until" | "since" | "habit";
type YearView = "remaining" | "full";
type TimeItem = {
  id: string;
  title: string;
  target: string;
  mode: Mode;
  category: string;
  note: string;
  recurrence: Recurrence;
};
type Habit = { id: string; title: string; frequency: "daily" | "weekdays"; icon: string };
type ItemMemory = {
  id: string;
  timeItemId: string;
  memoryDate: string;
  caption: string;
  photoPath: string | null;
  photoUrl: string | null;
};

type Template = {
  id: string;
  label: string;
  description: string;
  icon: string;
  mode: AddMode;
  title: string;
};

const DEFAULT: TimeItem = { id: "", title: "2027", target: "2027-01-01", mode: "until", category: "milestone", note: "", recurrence: "once" };
const STORAGE_KEY = "little-days-time-items";
const HABITS_KEY = "little-days-habits";
const HABIT_LOGS_KEY = "little-days-habit-logs";
const MODE_KEY = "little-days-modes";
const MARKS_KEY = "little-days-marked-dates";

const DEFAULT_HABITS: Habit[] = [
  { id: "habit-run", title: "Move your body", frequency: "daily", icon: "○" },
  { id: "habit-read", title: "Read", frequency: "daily", icon: "○" },
];

const TEMPLATES: Template[] = [
  { id: "birthday", label: "Birthday", description: "Something to look forward to", icon: "✦", mode: "until", title: "Birthday" },
  { id: "anniversary", label: "Anniversary", description: "Keep a special date close", icon: "♡", mode: "since", title: "Our anniversary" },
  { id: "trip", label: "A trip", description: "A place waiting ahead", icon: "↗", mode: "until", title: "A trip" },
  { id: "holiday", label: "Holiday", description: "A day worth anticipating", icon: "☼", mode: "until", title: "Holiday" },
  { id: "memory", label: "A little memory", description: "Remember when it began", icon: "✿", mode: "since", title: "A little memory" },
  { id: "milestone", label: "Milestone", description: "Mark a meaningful beginning", icon: "◇", mode: "since", title: "A milestone" },
  { id: "habit", label: "A habit", description: "One small thing to repeat", icon: "✓", mode: "habit", title: "A small habit" },
];

function dateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function parseDate(value: string) {
  return new Date(value + "T00:00:00");
}

function shiftDate(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
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

function birthdayAgeOnNextOccurrence(target: string) {
  const birth = parseDate(target);
  const occurrence = annualOccurrence(target);
  return Math.max(0, occurrence.getFullYear() - birth.getFullYear());
}

function completedYearsSince(target: string) {
  const start = parseDate(target);
  const today = parseDate(dateKey());
  let years = today.getFullYear() - start.getFullYear();
  const anniversaryThisYear = new Date(today.getFullYear(), start.getMonth(), start.getDate());
  if (anniversaryThisYear > today) years -= 1;
  return Math.max(0, years);
}

function annualOccurrence(target: string, from = new Date()) {
  const original = parseDate(target);
  let occurrence = new Date(from.getFullYear(), original.getMonth(), original.getDate());
  const today = parseDate(dateKey(from));
  if (occurrence < today) occurrence = new Date(from.getFullYear() + 1, original.getMonth(), original.getDate());
  return occurrence;
}

function daysUntilAnnual(target: string) {
  const occurrence = annualOccurrence(target);
  return Math.max(0, Math.floor((occurrence.getTime() - parseDate(dateKey()).getTime()) / 86400000));
}

function nextAnnualDate(target: string) {
  return dateKey(annualOccurrence(target));
}

function prettyDate(target: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(parseDate(target));
}

function shortDate(target: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(parseDate(target));
}

function gardenDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
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

export default function LittleDaysApp() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<TimeItem[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<Record<string, string[]>>({});
  const [markedDates, setMarkedDates] = useState<string[]>([]);
  const [activeId, setActiveId] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingDetail, setEditingDetail] = useState(false);
  const [view, setView] = useState<View>("today");
  const [yearView, setYearView] = useState<YearView>("remaining");
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("until");
  const [selectedTemplate, setSelectedTemplate] = useState("trip");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cloudHabitsReady, setCloudHabitsReady] = useState(false);
  const [memoriesByItem, setMemoriesByItem] = useState<Record<string, ItemMemory[]>>({});
  const [addingMemory, setAddingMemory] = useState(false);
  const [lightboxMemory, setLightboxMemory] = useState<ItemMemory | null>(null);

  const todayKey = dateKey();
  const progress = useMemo(yearProgress, []);
  const active = items.find((item) => item.id === activeId) ?? items[0];

  function itemIcon(item: TimeItem) {
    if (item.category === "travel") return "↗";
    if (item.category === "love") return "♡";
    if (item.category === "memory") return "✿";
    if (item.category === "holiday") return "☼";
    return "✦";
  }
  const upcoming = items
    .filter((item) => item.mode === "until" && (item.recurrence === "annual" || item.target >= todayKey))
    .sort((a, b) => {
      const aDate = a.recurrence === "annual" ? nextAnnualDate(a.target) : a.target;
      const bDate = b.recurrence === "annual" ? nextAnnualDate(b.target) : b.target;
      return aDate.localeCompare(bDate);
    });
  const memories = items.filter((item) => item.mode === "since").sort((a, b) => b.target.localeCompare(a.target));
  const todayMarked = markedDates.includes(todayKey);
  const completedHabits = habits.filter((habit) => (habitLogs[habit.id] ?? []).includes(todayKey)).length;
  const selectedDay = selectedDate ? parseDate(selectedDate) : null;

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  function go(nextView: View) {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

          const { data: cloudLogs } = await supabase.from("habit_logs").select("habit_id,log_date");
          const nextLogs: Record<string, string[]> = {};
          (cloudLogs ?? []).forEach((log) => {
            nextLogs[log.habit_id] = [...(nextLogs[log.habit_id] ?? []), log.log_date];
          });
          setHabitLogs(nextLogs);
        }

        const { data: timeData, error: timeError } = await supabase
          .from("time_items")
          .select("id,title,target_date,mode,category,note,recurrence")
          .order("created_at", { ascending: true });

        let loadedItems: TimeItem[] = [];

        if (!timeError && timeData) {
          loadedItems = timeData.map((item) => ({
            id: item.id,
            title: item.title,
            target: item.target_date,
            mode: item.mode === "since" ? "since" : "until",
            category: item.category || "life",
            note: item.note || "",
            recurrence: item.recurrence === "annual" ? "annual" : "once",
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
            category: "life",
            recurrence: "once",
            note: "",
          }));
        }

        if (!loadedItems.length) {
          const localItems = loadJson<TimeItem[]>(STORAGE_KEY, []);
          if (localItems.length) {
            loadedItems = localItems.map((item) => ({
              ...item,
              id: item.id || crypto.randomUUID(),
              category: item.category || "life",
              note: item.note || "",
            }));
          } else {
            const { data, error } = await supabase
              .from("countdowns")
              .insert({ user_id: user.id, title: DEFAULT.title, target_date: DEFAULT.target })
              .select("id,title,target_date")
              .single();

            if (error) throw error;
            loadedItems = [{ id: data.id, title: data.title, target: data.target_date, mode: "until", category: "milestone", note: "", recurrence: "once" }];
          }
        }

        const { data: cloudMarks, error: marksError } = await supabase
          .from("daily_marks")
          .select("mark_date")
          .order("mark_date", { ascending: true });

        let loadedMarks: string[];
        if (!marksError && cloudMarks) {
          loadedMarks = [...new Set([...localMarks, ...cloudMarks.map((mark) => mark.mark_date)])];
        } else {
          const { data: legacyMarks } = await supabase
            .from("check_ins")
            .select("check_date")
            .order("check_date", { ascending: true });
          loadedMarks = [...new Set([...localMarks, ...(legacyMarks ?? []).map((mark) => mark.check_date)])];
        }

        if (cancelled) return;
        setItems(loadedItems);
        setActiveId(loadedItems[0]?.id ?? "");
        setMarkedDates(loadedMarks);
        saveJson(STORAGE_KEY, loadedItems);
        saveJson(MARKS_KEY, loadedMarks);

        const { data: cloudMemories, error: memoriesError } = await supabase
          .from("item_memories")
          .select("id,time_item_id,memory_date,caption,photo_path,created_at")
          .order("memory_date", { ascending: false });

        if (!memoriesError && cloudMemories) {
          const grouped: Record<string, ItemMemory[]> = {};
          for (const memory of cloudMemories) {
            let photoUrl: string | null = null;
            if (memory.photo_path) {
              const { data: signed } = await supabase.storage
                .from("little-days")
                .createSignedUrl(memory.photo_path, 60 * 60);
              photoUrl = signed?.signedUrl ?? null;
            }
            const entry: ItemMemory = {
              id: memory.id,
              timeItemId: memory.time_item_id,
              memoryDate: memory.memory_date,
              caption: memory.caption || "",
              photoPath: memory.photo_path,
              photoUrl,
            };
            grouped[memory.time_item_id] = [...(grouped[memory.time_item_id] ?? []), entry];
          }
          setMemoriesByItem(grouped);
        }
      } catch (error) {
        if (!cancelled) setToast(error instanceof Error ? error.message : "Something went wrong while opening Little Days.");
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
    saveJson(HABITS_KEY, habits);
    saveJson(HABIT_LOGS_KEY, habitLogs);
  }, [habits, habitLogs]);
  useEffect(() => {
    if (!lightboxMemory) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxMemory(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxMemory]);



  async function toggleMark(targetDate: string) {
    if (busy || targetDate > todayKey) return;
    const previous = markedDates;
    const exists = previous.includes(targetDate);
    const optimistic = exists ? previous.filter((day) => day !== targetDate) : [...previous, targetDate].sort();
    setMarkedDates(optimistic);
    saveJson(MARKS_KEY, optimistic);
    setBusy(true);

    try {
      const { data: dailyMark, error: dailyError } = await supabase
        .from("daily_marks")
        .select("id")
        .eq("mark_date", targetDate)
        .maybeSingle();

      if (!dailyError) {
        if (exists) {
          if (dailyMark) {
            const { error } = await supabase.from("daily_marks").delete().eq("id", dailyMark.id);
            if (error) throw error;
          }
        } else {
          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) throw new Error("Your session has expired.");
          const { error } = await supabase.from("daily_marks").upsert(
            { user_id: userData.user.id, mark_date: targetDate },
            { onConflict: "user_id,mark_date" },
          );
          if (error) throw error;
        }
      } else {
        if (!active) throw new Error("Create a little day first.");
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("Your session has expired.");

        if (exists) {
          const { error } = await supabase.from("check_ins").delete().eq("countdown_id", active.id).eq("check_date", targetDate);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("check_ins").upsert(
            { countdown_id: active.id, user_id: userData.user.id, check_date: targetDate },
            { onConflict: "countdown_id,check_date" },
          );
          if (error) throw error;
        }
      }

      flash(exists ? "The day is open again." : targetDate === todayKey ? "Today grew a little." : "A little day was remembered.");
    } catch (error) {
      setMarkedDates(previous);
      saveJson(MARKS_KEY, previous);
      flash(error instanceof Error ? error.message : "Could not save that day.");
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
      if (cloudHabitsReady) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("Your session has expired.");
        if (!complete) {
          const { error } = await supabase.from("habit_logs").upsert(
            { habit_id: id, user_id: userData.user.id, log_date: todayKey },
            { onConflict: "habit_id,log_date" },
          );
          if (error) throw error;
        } else {
          const { error } = await supabase.from("habit_logs").delete().eq("habit_id", id).eq("log_date", todayKey);
          if (error) throw error;
        }
      }
      flash(complete ? "Habit opened again." : "A small thing, done.");
    } catch (error) {
      setHabitLogs((current) => ({ ...current, [id]: previous }));
      flash(error instanceof Error ? error.message : "Could not save this habit.");
    }
  }

  async function addThing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const target = String(form.get("target") || "");
    const icon = String(form.get("icon") || "○").trim() || "○";
    const category = String(form.get("category") || "life");
    const note = String(form.get("note") || "").trim();
    const recurrence = String(form.get("recurrence") || "once") === "annual" ? "annual" : "once";
    const frequency = String(form.get("frequency") || "daily") as Habit["frequency"];

    if (!title || (addMode !== "habit" && !target)) return;
    setBusy(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Your session has expired.");

      if (addMode === "habit") {
        const temp: Habit = { id: crypto.randomUUID(), title, frequency, icon };
        setHabits((current) => [...current, temp]);

        if (cloudHabitsReady) {
          const { data, error } = await supabase.from("habit_items")
            .insert({ user_id: userData.user.id, title, frequency, icon })
            .select("id,title,frequency,icon")
            .single();
          if (error) throw error;
          if (data) setHabits((current) => current.map((item) => item.id === temp.id ? { ...item, id: data.id } : item));
        }
      } else {
        const mode = addMode;
        const optimistic: TimeItem = { id: crypto.randomUUID(), title, target, mode, category, note, recurrence };
        setItems((current) => [...current, optimistic]);
        setActiveId(optimistic.id);

        const { data, error } = await supabase.from("time_items")
          .insert({ user_id: userData.user.id, title, target_date: target, mode, category, note, recurrence })
          .select("id,title,target_date,mode,category,note")
          .single();

        if (!error && data) {
          const saved: TimeItem = {
            id: data.id,
            title: data.title,
            target: data.target_date,
            mode: data.mode === "since" ? "since" : "until",
            category: data.category || category,
            note: data.note || note,
            recurrence: data.recurrence === "annual" ? "annual" : recurrence,
          };
          setItems((current) => current.map((item) => item.id === optimistic.id ? saved : item));
          setActiveId(data.id);
        } else if (error && mode === "until") {
          const { data: fallback, error: fallbackError } = await supabase.from("countdowns")
            .insert({ user_id: userData.user.id, title, target_date: target })
            .select("id,title,target_date")
            .single();
          if (fallbackError) throw fallbackError;
          const saved: TimeItem = { id: fallback.id, title: fallback.title, target: fallback.target_date, mode: "until", category, note, recurrence };
          setItems((current) => current.map((item) => item.id === optimistic.id ? saved : item));
          setActiveId(fallback.id);
        } else if (error) {
          throw error;
        }
        setItems((current) => {
          saveJson(STORAGE_KEY, current);
          return current;
        });
      }

      setShowAdd(false);
      flash(addMode === "habit" ? "A new little habit was planted." : addMode === "since" ? "A memory was added." : "Something to look forward to.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not add that yet.");
    } finally {
      setBusy(false);
    }
  }



  async function addMemory(timeItemId: string, form: FormData) {
    if (addingMemory) return;
    const caption = String(form.get("caption") || "").trim();
    const memoryDate = String(form.get("memoryDate") || todayKey);
    const file = form.get("photo");

    if (!(file instanceof File) || !file.size) {
      flash("Choose a photo first.");
      return;
    }

    setAddingMemory(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Your session has expired.");

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = userData.user.id + "/" + timeItemId + "/" + crypto.randomUUID() + "-" + safeName;

      const { error: uploadError } = await supabase.storage
        .from("little-days")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase.from("item_memories")
        .insert({
          user_id: userData.user.id,
          time_item_id: timeItemId,
          memory_date: memoryDate,
          caption,
          photo_path: path,
        })
        .select("id,time_item_id,memory_date,caption,photo_path")
        .single();

      if (error) {
        await supabase.storage.from("little-days").remove([path]);
        throw error;
      }

      const { data: signed } = await supabase.storage.from("little-days").createSignedUrl(path, 60 * 60);
      const entry: ItemMemory = {
        id: data.id,
        timeItemId: data.time_item_id,
        memoryDate: data.memory_date,
        caption: data.caption || "",
        photoPath: data.photo_path,
        photoUrl: signed?.signedUrl ?? null,
      };
      setMemoriesByItem((current) => ({
        ...current,
        [timeItemId]: [entry, ...(current[timeItemId] ?? [])],
      }));
      flash("A little memory was saved.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not save that memory.");
    } finally {
      setAddingMemory(false);
    }
  }

  async function deleteMemory(memory: ItemMemory) {
    if (!window.confirm("Remove this memory?")) return;
    try {
      const { error } = await supabase.from("item_memories").delete().eq("id", memory.id);
      if (error) throw error;
      if (memory.photoPath) {
        await supabase.storage.from("little-days").remove([memory.photoPath]);
      }
      setMemoriesByItem((current) => ({
        ...current,
        [memory.timeItemId]: (current[memory.timeItemId] ?? []).filter((entry) => entry.id !== memory.id),
      }));
      flash("Memory removed.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not remove that memory.");
    }
  }

  async function updateItem(id: string, title: string, target: string, note: string, category: string, recurrence: Recurrence) {
    if (busy || !title.trim() || !target) return;
    const previous = items;
    const next = items.map((item) => item.id === id ? { ...item, title: title.trim(), target, note: note.trim(), category, recurrence } : item);
    setItems(next);
    saveJson(STORAGE_KEY, next);
    setBusy(true);

    try {
      const { error } = await supabase.from("time_items")
        .update({ title: title.trim(), target_date: target, note: note.trim(), category, recurrence })
        .eq("id", id);
      if (error) {
        // Legacy countdowns do not have the richer fields; retain the local representation.
        const { error: fallbackError } = await supabase.from("countdowns")
          .update({ title: title.trim(), target_date: target })
          .eq("id", id);
        if (fallbackError) throw error;
      }
      setEditingDetail(false);
      flash("Little day updated.");
    } catch (error) {
      setItems(previous);
      saveJson(STORAGE_KEY, previous);
      flash(error instanceof Error ? error.message : "Could not update that little day.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(id: string) {
    if (busy || items.length <= 1) return;
    const item = items.find((entry) => entry.id === id);
    if (!item || !window.confirm(`Remove “${item.title}”?`)) return;

    const previous = items;
    setItems(items.filter((entry) => entry.id !== id));
    if (activeId === id) setActiveId(items.find((entry) => entry.id !== id)?.id ?? "");

    try {
      const { error } = await supabase.from("time_items").delete().eq("id", id);
      if (error) {
        const fallback = await supabase.from("countdowns").delete().eq("id", id);
        if (fallback.error) throw error;
      }
      saveJson(STORAGE_KEY, items.filter((entry) => entry.id !== id));
      flash("Removed.");
    } catch (error) {
      setItems(previous);
      flash(error instanceof Error ? error.message : "Could not remove that.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  function openAdd(mode: AddMode = "until", templateId?: string) {
    setAddMode(mode);
    if (templateId) {
      const template = TEMPLATES.find((item) => item.id === templateId);
      if (template) {
        setSelectedTemplate(template.id);
        setAddMode(template.mode);
      }
    }
    setShowAdd(true);
  }

  const selectedTemplateData = TEMPLATES.find((template) => template.id === selectedTemplate) ?? TEMPLATES[0];

  const yearDays = useMemo(
    () => Array.from({ length: progress.total }, (_, index) => new Date(progress.year, 0, index + 1)),
    [progress.year, progress.total],
  );

  const remainingYearDays = yearDays.slice(progress.passed);
  const yearStartOffset = new Date(progress.year, 0, 1).getDay();
  const fullYearCells = Array.from({ length: 53 * 7 }, (_, index) => {
    const dayIndex = index - yearStartOffset;
    return dayIndex >= 0 && dayIndex < progress.total ? yearDays[dayIndex] : null;
  });

  const gardenMonths = Array.from({ length: 12 }, (_, month) => {
    const monthStart = new Date(progress.year, month, 1);
    const days = new Date(progress.year, month + 1, 0).getDate();
    const offset = monthStart.getDay();
    return {
      month,
      label: new Intl.DateTimeFormat("en", { month: "long" }).format(monthStart),
      cells: Array.from({ length: offset + days }, (_, index) => (
        index < offset ? null : new Date(progress.year, month, index - offset + 1)
      )),
    };
  });

  if (loading) {
    return <main className="ld-shell"><div className="ld-frame"><div className="ld-loading"><span>✿</span><p>Growing your little garden…</p></div></div></main>;
  }

  const nav = (
    <nav className="ld-nav" aria-label="Little Days">
      <button className={view === "today" ? "active" : ""} onClick={() => go("today")} type="button"><span>⌂</span>Today</button>
      <button className={view === "ahead" ? "active" : ""} onClick={() => go("ahead")} type="button"><span>↗</span>Ahead</button>
      <button className={view === "since" ? "active" : ""} onClick={() => go("since")} type="button"><span>↙</span>Since</button>
      <button className={view === "garden" ? "active" : ""} onClick={() => go("garden")} type="button"><span>✿</span>Garden</button>
    </nav>
  );

  return (
    <main className="ld-shell">
      <div className="ld-frame">
        <header className="ld-topbar">
          <button className="ld-brand" type="button" onClick={() => go("today")} aria-label="Little Days home">
            <span className="ld-brand-mark">✿</span>
            <span>Little Days</span>
          </button>
          {nav}
          <button className="ld-add-button" type="button" onClick={() => openAdd()}>+ Add</button>
        </header>


        {view === "today" && (
          <section className="ld-page ld-home">
            <div className="ld-home-top">
              <div>
                <span className="ld-eyebrow">this year · {progress.year}</span>
                <h1>Make this year visible.</h1>
                <p>{shortDate(todayKey)} · {progress.total - progress.passed} days still ahead.</p>
              </div>
              <button className={"ld-today-mark " + (todayMarked ? "done" : "")} type="button" onClick={() => toggleMark(todayKey)} disabled={busy}>
                <span>{todayMarked ? "✓" : "○"}</span>
                {todayMarked ? "Today remembered" : "Mark today"}
              </button>
            </div>

            <article className="ld-year-focus">
              <div className="ld-year-focus-top">
                <div>
                  <span className="ld-eyebrow">{progress.year} / this year</span>
                  <div className="ld-year-number">{progress.year}</div>
                </div>
                <div className="ld-year-left">
                  <strong>{progress.total - progress.passed}</strong>
                  <span>days left</span>
                </div>
              </div>

              <div className="ld-year-switch" role="tablist" aria-label="Year tracker view">
                <button type="button" className={yearView === "remaining" ? "active" : ""} onClick={() => setYearView("remaining")}>
                  Days remaining
                </button>
                <button type="button" className={yearView === "full" ? "active" : ""} onClick={() => setYearView("full")}>
                  Full year
                </button>
              </div>

              {yearView === "remaining" ? (
                <div className="ld-remaining-tracker">
                  <div className="ld-tracker-labels">
                    <span>{shortDate(todayKey)}</span>
                    <span>Dec 31</span>
                  </div>
                  <div className="ld-remaining-dots" aria-label="Days from today through the end of the year">
                    {remainingYearDays.map((day) => {
                      const key = dateKey(day);
                      return <span key={key} className={key === todayKey ? "today" : ""} title={prettyDate(key)} />;
                    })}
                  </div>
                  <p><strong>{progress.total - progress.passed}</strong> days after today · {remainingYearDays.length} dots from today to the end of {progress.year}</p>
                </div>
              ) : (
                <div className="ld-full-year-tracker">
                  <div className="ld-full-year-months" aria-hidden="true">
                    {yearDays.filter((day) => day.getDate() === 1).map((day) => (
                      <span key={dateKey(day)}>{new Intl.DateTimeFormat("en", { month: "short" }).format(day)}</span>
                    ))}
                  </div>
                  <div className="ld-full-year-dots" aria-label="Full year tracker">
                    {fullYearCells.map((day, index) => {
                      if (!day) return <i key={"blank-" + index} className="blank" />;
                      const key = dateKey(day);
                      const state = key < todayKey ? "passed" : key === todayKey ? "today" : "ahead";
                      return <i key={key} className={state} title={prettyDate(key)} />;
                    })}
                  </div>
                  <div className="ld-full-year-legend">
                    <span><i className="passed" />passed</span>
                    <span><i className="today" />today</span>
                    <span><i className="ahead" />ahead</span>
                  </div>
                </div>
              )}

              <div className="ld-year-focus-meta">
                <span>{progress.passed} days passed</span>
                <span>{progress.percent}% of {progress.year}</span>
                <span>{progress.total - progress.passed} ahead</span>
              </div>
            </article>

            <div className="ld-home-next">
              <div className="ld-section-row compact">
                <div><span className="ld-eyebrow">look ahead</span><h2>Next little days</h2></div>
                <button className="ld-link-button" type="button" onClick={() => go("ahead")}>See all ↗</button>
              </div>
              <div className="ld-mini-grid">
                {upcoming.slice(0, 3).map((item) => (
                  <button className="ld-object-card" key={item.id} type="button" onClick={() => { setActiveId(item.id); setDetailId(item.id); }}>
                    <span className="ld-object-icon">{itemIcon(item)}</span>
                    <span><strong>{item.title}</strong><small>{daysUntil(item.target)} days · {shortDate(item.target)}</small></span>
                  </button>
                ))}
                <button className="ld-object-card ld-empty-object" type="button" onClick={() => openAdd("until")}>
                  <span className="ld-object-icon">+</span>
                  <span><strong>Keep a new date</strong><small>trip, birthday, deadline, anything</small></span>
                </button>
              </div>
            </div>

            <div className="ld-home-lower">
              <article className="ld-card ld-habit-card">
                <div className="ld-section-row compact"><div><span className="ld-eyebrow">live today</span><h2>Little habits</h2></div><span className="ld-count">{completedHabits}/{habits.length}</span></div>
                <div className="ld-habits">
                  {habits.map((habit) => {
                    const done = (habitLogs[habit.id] ?? []).includes(todayKey);
                    return <button key={habit.id} type="button" className={"ld-habit " + (done ? "done" : "")} onClick={() => toggleHabit(habit.id)}><span>{done ? "✓" : habit.icon}</span><strong>{habit.title}</strong><small>{habit.frequency === "daily" ? "daily" : "weekdays"}</small></button>;
                  })}
                </div>
                <button className="ld-inline-add" type="button" onClick={() => openAdd("habit")}>+ add a small habit</button>
              </article>

              <article className="ld-card ld-memory-card">
                <div className="ld-section-row compact"><div><span className="ld-eyebrow">look back</span><h2>Remembered</h2></div><span className="ld-count">{markedDates.length}</span></div>
                <div className="ld-memory-preview">
                  <div className="ld-memory-flower">{todayMarked ? "✿" : "○"}</div>
                  <div><strong>{todayMarked ? "Today is in the garden." : "Today is still a bud."}</strong><p>{markedDates.length ? markedDates.length + " little days have been noticed." : "Mark a day and it will become part of your garden."}</p></div>
                </div>
                <button className="ld-inline-add" type="button" onClick={() => go("garden")}>Open the garden ↗</button>
              </article>
            </div>
          </section>
        )}


        {view === "ahead" && (
          <section className="ld-page">
            <div className="ld-page-heading">
              <span className="ld-eyebrow">look forward</span>
              <h1>Ahead</h1>
              <p>Trips, birthdays, plans, deadlines — the little things waiting for you.</p>
              <button className="ld-primary" type="button" onClick={() => openAdd("until")}>+ Keep a date</button>
            </div>
            <div className="ld-list">
              {upcoming.length === 0 && <div className="ld-empty-state"><span>✦</span><h2>Nothing ahead yet.</h2><p>Give yourself something to look forward to.</p><button className="ld-primary" onClick={() => openAdd("until")} type="button">Add a date</button></div>}
              {upcoming.map((item) => (
                <article className="ld-large-object" key={item.id}>
                  <button type="button" className="ld-large-object-main" onClick={() => { setActiveId(item.id); setDetailId(item.id); }}>
                    <span className="ld-large-icon">{itemIcon(item)}</span>
                    <span><strong>{item.title}</strong><small>{prettyDate(item.target)}</small></span>
                    <span className="ld-large-value"><strong>{daysUntil(item.target)}</strong><small>days</small></span>
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "since" && (
          <section className="ld-page">
            <div className="ld-page-heading">
              <span className="ld-eyebrow">look back</span>
              <h1>Since</h1>
              <p>Beginnings, anniversaries, firsts, and little memories that keep going.</p>
              <button className="ld-primary" type="button" onClick={() => openAdd("since")}>+ Remember a day</button>
            </div>
            <div className="ld-list">
              {memories.length === 0 && <div className="ld-empty-state"><span>✿</span><h2>Nothing remembered yet.</h2><p>Add a day that started something.</p><button className="ld-primary" onClick={() => openAdd("since")} type="button">Remember a day</button></div>}
              {memories.map((item) => (
                <article className="ld-large-object" key={item.id}>
                  <button type="button" className="ld-large-object-main" onClick={() => { setActiveId(item.id); setDetailId(item.id); }}>
                    <span className="ld-large-icon memory">{itemIcon(item)}</span>
                    <span><strong>{item.title}</strong><small>since {prettyDate(item.target)}</small></span>
                    <span className="ld-large-value"><strong>{daysSince(item.target)}</strong><small>days</small></span>
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "garden" && (
          <section className="ld-page ld-garden-page">
            <div className="ld-page-heading garden-heading">
              <span className="ld-eyebrow">your little garden · {progress.year}</span>
              <h1>Days become flowers.</h1>
              <p>Remembered days bloom. Today is a bud. The garden begins at January 1, not at an arbitrary window.</p>
              <span className="ld-garden-count">{markedDates.length} remembered days</span>
            </div>

            <div className="ld-annual-garden">
              {gardenMonths.map((month) => (
                <article className="ld-month-garden" key={month.month}>
                  <div className="ld-month-garden-head">
                    <strong>{month.label}</strong>
                    <span>{month.cells.filter(Boolean).length} days</span>
                  </div>
                  <div className="ld-month-weekdays">
                    {["S","M","T","W","T","F","S"].map((day, index) => <span key={day + "-" + index}>{day}</span>)}
                  </div>
                  <div className="ld-month-days">
                    {month.cells.map((day, index) => {
                      if (!day) return <i className="blank" key={"blank-" + month.month + "-" + index} />;
                      const key = dateKey(day);
                      const marked = markedDates.includes(key);
                      const today = key === todayKey;
                      const future = key > todayKey;
                      const state = (today ? "today" : future ? "future" : "past") + (marked ? " marked" : "");
                      return <button key={key} type="button" className={state} onClick={() => setSelectedDate(key)} aria-label={gardenDateLabel(day) + ", " + (marked ? "remembered" : today ? "today" : future ? "ahead" : "unmarked")}><span>{day.getDate()}</span><i /></button>;
                    })}
                  </div>
                </article>
              ))}
            </div>

            <div className="ld-garden-legend">
              <span><i className="marked" />remembered</span>
              <span><i className="today" />today</span>
              <span><i className="seed" />ahead</span>
            </div>

            {selectedDay && (
              <div className="ld-garden-detail">
                <div><span className="ld-eyebrow">{selectedDate === todayKey ? "today" : markedDates.includes(selectedDate!) ? "remembered" : selectedDate! > todayKey ? "not here yet" : "a quiet day"}</span><h2>{gardenDateLabel(selectedDay)}</h2><p>{selectedDate === todayKey ? (todayMarked ? "You noticed today. Keep it small." : "Today is still a bud.") : markedDates.includes(selectedDate!) ? "This day is part of your garden." : selectedDate! > todayKey ? "This day is still waiting for you." : "No mark was left. That is okay."}</p></div>
                {selectedDate! <= todayKey && <button type="button" className={"ld-primary " + (markedDates.includes(selectedDate!) ? "soft" : "")} onClick={() => toggleMark(selectedDate!)} disabled={busy}>{markedDates.includes(selectedDate!) ? "✓ Remembered" : "Remember this day"}</button>}
              </div>
            )}
          </section>
        )}


        {detailId && (() => {
          const detailItem = items.find((item) => item.id === detailId);
          if (!detailItem) return null;
          const detailDays = detailItem.mode === "until"
            ? (detailItem.recurrence === "annual" ? daysUntilAnnual(detailItem.target) : daysUntil(detailItem.target))
            : daysSince(detailItem.target);
          const detailNextDate = detailItem.recurrence === "annual" ? nextAnnualDate(detailItem.target) : detailItem.target;
          const isPast = detailItem.mode === "until" && detailItem.recurrence !== "annual" && detailItem.target < todayKey;
          const relationshipYears = detailItem.mode === "since" && detailItem.recurrence === "annual" ? completedYearsSince(detailItem.target) : null;
          const daysToNextAnniversary = detailItem.mode === "since" && detailItem.recurrence === "annual" ? daysUntilAnnual(detailItem.target) : null;
          const birthdayAge = detailItem.category === "birthday" && detailItem.recurrence === "annual" ? birthdayAgeOnNextOccurrence(detailItem.target) : null;
          return (
            <div className="ld-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setDetailId(null); setEditingDetail(false); } }}>
              <article className="ld-detail-view" role="dialog" aria-modal="true" aria-label={detailItem.title}>
                <button className="ld-detail-close" type="button" onClick={() => { setDetailId(null); setEditingDetail(false); }} aria-label="Close">×</button>

                {!editingDetail ? (
                  <>
                    {(memoriesByItem[detailItem.id] ?? []).find((memory) => memory.photoUrl) && (
                      <button
                        type="button"
                        className="ld-detail-cover"
                        onClick={() => {
                          const cover = (memoriesByItem[detailItem.id] ?? []).find((memory) => memory.photoUrl);
                          if (cover) setLightboxMemory(cover);
                        }}
                        aria-label="Open memory photo"
                      >
                        <img src={(memoriesByItem[detailItem.id] ?? []).find((memory) => memory.photoUrl)?.photoUrl ?? ""} alt="" />
                        <span>Open memory</span>
                      </button>
                    )}
                    <div className={"ld-detail-hero " + (detailItem.mode === "since" ? "memory" : "")}>
                      <span className="ld-detail-icon">{itemIcon(detailItem)}</span>
                      <span className="ld-eyebrow">{detailItem.mode === "until" ? (isPast ? "past little day" : "coming up") : "remembered"}</span>
                      <h2>{detailItem.title}</h2>
                      <p>{detailItem.recurrence === "annual" ? "Every year · " + prettyDate(detailNextDate) : prettyDate(detailItem.target)}</p>
                    </div>

                    <div className={"ld-detail-number " + (relationshipYears !== null || birthdayAge !== null ? "relationship-number" : "")}>
                      <strong>{birthdayAge !== null ? birthdayAge : relationshipYears !== null ? relationshipYears : detailDays}</strong>
                      <span>{birthdayAge !== null ? "years old on this birthday" : relationshipYears !== null ? (relationshipYears === 1 ? "year together" : "years together") : (detailItem.mode === "until" ? "days until" : "days since")}</span>
                    </div>
                    {relationshipYears !== null && (
                      <div className="ld-anniversary-strip">
                        <div>
                          <span className="ld-eyebrow">next anniversary</span>
                          <strong>{daysToNextAnniversary === 0 ? "Today." : daysToNextAnniversary + " days away"}</strong>
                        </div>
                        <span>{prettyDate(detailNextDate)}</span>
                      </div>
                    )}
                    {birthdayAge !== null && (
                      <div className="ld-anniversary-strip birthday-strip">
                        <div>
                          <span className="ld-eyebrow">next birthday</span>
                          <strong>{daysUntilAnnual(detailItem.target) === 0 ? "Today." : "Turns " + birthdayAge}</strong>
                        </div>
                        <span>{prettyDate(detailNextDate)}</span>
                      </div>
                    )}

                    <div className="ld-detail-progress">
                      <div className="ld-detail-progress-line">
                        <span className={detailItem.mode === "since" ? "filled" : ""} />
                      </div>
                      <div>
                        <span>{detailItem.mode === "since" ? "The days keep growing." : isPast ? "This date has passed." : "A little day is waiting for you."}</span>
                        <span>{shortDate(detailNextDate)}</span>
                      </div>
                    </div>

                    <div className="ld-detail-note">
                      <span className="ld-eyebrow">a little note</span>
                      <p>{detailItem.note || "Nothing written yet. You can add a small note about why this day matters."}</p>
                    </div>

                    <div className="ld-detail-memories">
                      <div className="ld-detail-section-head">
                        <div><span className="ld-eyebrow">little memories</span><h3>Keep a moment.</h3></div>
                        <span>{(memoriesByItem[detailItem.id] ?? []).length}</span>
                      </div>

                      {(memoriesByItem[detailItem.id] ?? []).length > 0 && (
                        <div className="ld-memory-strip">
                          {(memoriesByItem[detailItem.id] ?? []).map((memory) => (
                            <figure key={memory.id} className="ld-memory-photo">
                              <button type="button" className="ld-memory-image-button" onClick={() => setLightboxMemory(memory)} aria-label={"Open " + (memory.caption || "memory photo")}>
                                {memory.photoUrl ? <img src={memory.photoUrl} alt={memory.caption || "A memory"} /> : <div className="ld-memory-photo-placeholder">✿</div>}
                              </button>
                              <figcaption>
                                <span>{shortDate(memory.memoryDate)}</span>
                                <strong>{memory.caption || "A quiet moment."}</strong>
                                <button type="button" onClick={() => deleteMemory(memory)}>Remove</button>
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      )}

                      <form className="ld-memory-add" onSubmit={(event) => {
                        event.preventDefault();
                        void addMemory(detailItem.id, new FormData(event.currentTarget));
                        event.currentTarget.reset();
                      }}>
                        <label className="ld-memory-upload">
                          <span>＋</span>
                          <strong>Add a photo</strong>
                          <small>One moment at a time.</small>
                          <input type="file" name="photo" accept="image/*" required />
                        </label>
                        <div className="ld-memory-fields">
                          <input className="ld-input" type="date" name="memoryDate" defaultValue={todayKey} />
                          <input className="ld-input" name="caption" placeholder="A tiny caption (optional)" />
                        </div>
                        <button className="ld-secondary" type="submit" disabled={addingMemory}>{addingMemory ? "Saving…" : "Save memory"}</button>
                      </form>
                    </div>

                    <div className="ld-detail-actions">
                      <button type="button" className="ld-secondary" onClick={() => setEditingDetail(true)}>Edit</button>
                      <button type="button" className="ld-danger-pill" onClick={async () => { setDetailId(null); await deleteItem(detailItem.id); }}>Remove</button>
                    </div>
                  </>
                ) : (
                  <form className="ld-detail-edit" onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    updateItem(detailItem.id, String(form.get("title") || ""), String(form.get("target") || ""), String(form.get("note") || ""), String(form.get("category") || "life"), String(form.get("recurrence") || "once") === "annual" ? "annual" : "once");
                  }}>
                    <span className="ld-eyebrow">edit little day</span>
                    <h2>Keep the details close.</h2>
                    <label>Title<input className="ld-input" name="title" defaultValue={detailItem.title} /></label>
                    <label>Date<input className="ld-input" type="date" name="target" defaultValue={detailItem.target} /></label>
                    <label>Repeats<select className="ld-input" name="recurrence" defaultValue={detailItem.recurrence}><option value="once">Once</option><option value="annual">Every year</option></select></label>
                    <label>Kind<select className="ld-input" name="category" defaultValue={detailItem.category}>
                      <option value="life">Life</option><option value="travel">Travel</option><option value="love">Love</option><option value="memory">Memory</option><option value="holiday">Holiday</option><option value="milestone">Milestone</option>
                    </select></label>
                    <label>Note<textarea className="ld-input ld-textarea" name="note" defaultValue={detailItem.note} placeholder="Why does this little day matter?" /></label>
                    <div className="ld-detail-actions"><button type="button" className="ld-secondary" onClick={() => setEditingDetail(false)}>Cancel</button><button type="submit" className="ld-primary" disabled={busy}>Save changes</button></div>
                  </form>
                )}
              </article>
            </div>
          );
        })()}

        {lightboxMemory && (
          <div className="ld-lightbox" role="dialog" aria-modal="true" aria-label={lightboxMemory.caption || "Memory photo"} onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxMemory(null); }}>
            <button type="button" className="ld-lightbox-close" onClick={() => setLightboxMemory(null)} aria-label="Close">×</button>
            {lightboxMemory.photoUrl && <img src={lightboxMemory.photoUrl} alt={lightboxMemory.caption || "A memory"} />}
            <div className="ld-lightbox-caption">
              <span>{prettyDate(lightboxMemory.memoryDate)}</span>
              <strong>{lightboxMemory.caption || "A quiet moment."}</strong>
            </div>
          </div>
        )}

        <footer className="ld-footer"><span>Little Days · a small ritual around time</span><button type="button" onClick={signOut}>Sign out</button><span>Made for two people who keep choosing each other.</span></footer>
      </div>

      {showAdd && (
        <div className="ld-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}>
          <section className="ld-modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <div className="ld-modal-top"><div><span className="ld-eyebrow">keep a little day</span><h2 id="add-title">What would you like to keep?</h2><p>Start with the smallest useful detail. You can make it richer later.</p></div><button type="button" className="ld-close" onClick={() => setShowAdd(false)}>×</button></div>

            <div className="ld-template-section"><span className="ld-form-label">Start with an idea</span><div className="ld-template-grid">
              {TEMPLATES.map((template) => <button key={template.id} type="button" className={`ld-template ${selectedTemplate === template.id ? "active" : ""}`} onClick={() => { setSelectedTemplate(template.id); setAddMode(template.mode); }}><span>{template.icon}</span><strong>{template.label}</strong><small>{template.description}</small></button>)}
            </div></div>

            <form className="ld-form" onSubmit={addThing}>
              <div className="ld-form-context">
                <span className="ld-context-icon">{selectedTemplateData.icon}</span>
                <div>
                  <strong>{selectedTemplateData.label}</strong>
                  <span>{selectedTemplateData.description}</span>
                </div>
              </div>

              <div className="ld-form-grid">
                <label>
                  <span className="ld-form-label">{selectedTemplateData.id === "birthday" ? "Whose birthday?" : selectedTemplateData.id === "anniversary" ? "What are you celebrating?" : selectedTemplateData.id === "trip" ? "Where are you going?" : selectedTemplateData.id === "holiday" ? "What are you looking forward to?" : selectedTemplateData.id === "memory" ? "What should you remember?" : selectedTemplateData.id === "milestone" ? "What happened?" : "Name"}</span>
                  <input
                    className="ld-input"
                    name="title"
                    defaultValue={selectedTemplateData.title}
                    key={selectedTemplateData.id}
                    placeholder={selectedTemplateData.id === "trip" ? "e.g. Kyoto" : selectedTemplateData.id === "birthday" ? "e.g. Mum" : selectedTemplateData.id === "anniversary" ? "e.g. Our first date" : selectedTemplateData.title}
                    required
                  />
                </label>

                {addMode !== "habit" && <label>
                  <span className="ld-form-label">{selectedTemplateData.id === "birthday" ? "When were they born?" : selectedTemplateData.id === "anniversary" ? "When did it begin?" : selectedTemplateData.id === "trip" ? "When do you leave?" : selectedTemplateData.id === "holiday" ? "When is it?" : selectedTemplateData.id === "memory" ? "When did it happen?" : selectedTemplateData.id === "milestone" ? "When did it happen?" : addMode === "since" ? "When did it begin?" : "When is it?"}</span>
                  <input
                    className="ld-input"
                    name="target"
                    type="date"
                    max={addMode === "since" ? todayKey : undefined}
                    defaultValue=""
                    key={selectedTemplateData.id + "-date"}
                    required
                  />
                </label>}

                {addMode !== "habit" && <label className="ld-recurrence-field">
                  <span className="ld-form-label">Repeats</span>
                  <select className="ld-input" name="recurrence" key={selectedTemplateData.id + "-recurrence"} defaultValue={["birthday","anniversary","holiday"].includes(selectedTemplateData.id) ? "annual" : "once"}>
                    <option value="once">Just this date</option>
                    <option value="annual">Every year</option>
                  </select>
                </label>}
              </div>

              {addMode !== "habit" && <div className="ld-form-grid ld-note-row">
                <label>
                  <span className="ld-form-label">{selectedTemplateData.id === "trip" ? "Trip note" : selectedTemplateData.id === "birthday" ? "A little birthday note" : selectedTemplateData.id === "anniversary" ? "Why this date matters" : selectedTemplateData.id === "memory" ? "What do you remember?" : "A little note"}</span>
                  <textarea className="ld-input ld-textarea" name="note" placeholder={selectedTemplateData.id === "trip" ? "Plans, places, reservations…" : selectedTemplateData.id === "birthday" ? "A wish, tradition, or little detail…" : selectedTemplateData.id === "anniversary" ? "A place, story, or reason to celebrate…" : selectedTemplateData.id === "memory" ? "Write down what you want to keep…" : "A small note for later…"} rows={3} />
                </label>
                <input type="hidden" name="category" value={selectedTemplateData.id === "trip" ? "travel" : selectedTemplateData.id === "anniversary" ? "love" : selectedTemplateData.id === "holiday" ? "holiday" : selectedTemplateData.id === "memory" ? "memory" : selectedTemplateData.id === "milestone" ? "milestone" : selectedTemplateData.id === "birthday" ? "birthday" : "life"} />
              </div>}

              {addMode === "habit" && <div className="ld-form-grid">
                <label><span className="ld-form-label">Frequency</span><select className="ld-input" name="frequency" defaultValue="daily"><option value="daily">Every day</option><option value="weekdays">Weekdays</option></select></label>
                <label><span className="ld-form-label">Symbol</span><input className="ld-input" name="icon" defaultValue="○" maxLength={2} /></label>
              </div>}

              <div className="ld-modal-actions"><button type="button" className="ld-secondary" onClick={() => setShowAdd(false)}>Not now</button><button className="ld-primary" type="submit" disabled={busy}>{busy ? "Saving…" : addMode === "habit" ? "Plant habit" : addMode === "since" ? "Keep the memory" : selectedTemplateData.id === "trip" ? "Keep the trip" : selectedTemplateData.id === "birthday" ? "Keep the birthday" : selectedTemplateData.id === "anniversary" ? "Keep the anniversary" : "Keep it"}</button></div>
            </form>
            <p className="ld-modal-footnote">Later: notes, photos, reminders, location, people, and shared days can grow around the same little object.</p>
          </section>
        </div>
      )}

      <nav className="ld-mobile-nav" aria-label="Mobile navigation">
        <button className={view === "today" ? "active" : ""} type="button" onClick={() => go("today")}><span>⌂</span>Today</button>
        <button className={view === "ahead" ? "active" : ""} type="button" onClick={() => go("ahead")}><span>↗</span>Ahead</button>
        <button className="ld-mobile-add" type="button" onClick={() => openAdd()}>+</button>
        <button className={view === "since" ? "active" : ""} type="button" onClick={() => go("since")}><span>↙</span>Since</button>
        <button className={view === "garden" ? "active" : ""} type="button" onClick={() => go("garden")}><span>✿</span>Garden</button>
      </nav>

      {toast && <div className="ld-toast" role="status">{toast}</div>}
    </main>
  );
}
