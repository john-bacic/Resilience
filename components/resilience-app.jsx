"use client";

import { useUser } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bell,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Heart,
  Home,
  LineChart,
  MessageCircle,
  Moon,
  NotebookPen,
  Play,
  RefreshCw,
  Share2,
  Sun,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import QRCode from "react-qr-code";

const SCENARIOS = [
  "Someone does not reply to your message.",
  "A friend cancels plans at the last minute.",
  "You get criticized in front of other people.",
  "You make a mistake and feel embarrassed.",
  "Someone seems cold toward you for no clear reason.",
  "You are left out of a plan.",
  "Your work gets feedback that feels harsh.",
  "Someone misunderstands your intention.",
  "You do not get the opportunity you wanted.",
  "You feel ignored in a group setting.",
  "A message sounds rude and you replay it all day.",
  "Someone takes longer than expected to get back to you.",
  "A person you like seems distant.",
  "Your effort goes unnoticed.",
  "Someone changes plans without asking you.",
  "You feel compared to someone else.",
  "A social interaction feels awkward after the fact.",
  "You receive no feedback after doing your best.",
  "A person disappoints you unexpectedly.",
  "Someone questions your judgment.",
  "You feel pressure to prove yourself.",
  "A delay ruins the plan you made.",
  "You think someone is upset with you.",
  "An invitation never comes.",
  "Someone is dismissive when you speak.",
  "A result is uncertain and you cannot get clarity yet.",
  "You have to wait without knowing the outcome.",
  "Someone else gets chosen instead of you.",
  "You feel judged for a small mistake.",
  "A conversation ends without the validation you hoped for."
];

/** Undo delete toast duration (must match progress bar animation + timeout). */
const DELETE_UNDO_TOAST_MS = 6000;

const DEFAULT_STATE = {
  day: 1,
  startDate: null,
  reminderTime: "8:00 AM",
  tone: "Balanced",
  personalProfile: {
    age: "",
    birthday: "",
    maritalStatus: "",
    children: "",
    dog: "",
    partner: "",
    job: "",
    friends: "",
    notes: ""
  },
  intentions: [],
  reflections: [],
  diary: [],
  scenarioHistory: [],
  lastCompletedDay: 0,
  streak: 0
};

function getRandomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeAppState(raw) {
  try {
    const merged = { ...DEFAULT_STATE, ...(raw && typeof raw === "object" ? raw : {}) };
    merged.intentions = Array.isArray(merged.intentions) ? merged.intentions : [];
    merged.reflections = Array.isArray(merged.reflections) ? merged.reflections : [];
    merged.scenarioHistory = Array.isArray(merged.scenarioHistory)
      ? merged.scenarioHistory.map((s) => String(s || "").trim()).filter(Boolean)
      : [];
    merged.diary = Array.isArray(merged.diary)
      ? merged.diary.map((entry) => {
          if (!entry || typeof entry !== "object") {
            return { id: getRandomId(), triggeredSteps: [], title: "", createdAt: new Date().toISOString() };
          }
          const id =
            typeof entry.id === "string" && entry.id.trim() ? entry.id : getRandomId();
          return {
            ...entry,
            id,
            triggeredSteps: Array.isArray(entry.triggeredSteps) ? entry.triggeredSteps : []
          };
        })
      : [];
    merged.personalProfile = {
      ...DEFAULT_STATE.personalProfile,
      ...(typeof merged.personalProfile === "object" && merged.personalProfile ? merged.personalProfile : {})
    };
    return merged;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/** Normalize GET/PATCH /api/me/sharing JSON into { enabled, shareDisplayName, grants, inviteUrl }. */
function normalizeSharingApiPayload(data) {
  const enabled = Boolean(data?.enabled);
  const shareDisplayName = typeof data?.shareDisplayName === "string" ? data.shareDisplayName : "";
  const inviteUrl = typeof data?.inviteUrl === "string" && data.inviteUrl.trim() ? data.inviteUrl.trim() : null;
  const grants = Array.isArray(data?.grants)
    ? data.grants
        .filter((g) => g && typeof g.userId === "string")
        .map((g) => ({ userId: g.userId, label: typeof g.label === "string" ? g.label : g.userId }))
    : (Array.isArray(data?.grantedTo) ? data.grantedTo : []).map((userId) => ({ userId, label: userId }));
  return { enabled, shareDisplayName, grants, inviteUrl };
}

function weekFocus(day) {
  if (day <= 7) return "Facts vs Story";
  if (day <= 14) return "Control Filter";
  if (day <= 21) return "Chosen Meaning";
  return "Resilience";
}

function scenarioForDay(day) {
  return SCENARIOS[(day - 1) % SCENARIOS.length];
}

function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function programDayFromStart(startDateKey) {
  if (!startDateKey) return 1;
  const [year, month, day] = String(startDateKey).split("-").map(Number);
  if (!year || !month || !day) return 1;
  const start = new Date(year, month - 1, day);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayStart - start) / 86400000) + 1;
  return Math.max(1, Math.min(30, diffDays));
}

/** Program day (1–30) for an event on `entryDateKey` relative to program `startDateKey`. Null if entry is before start. */
function programDayForEntry(startDateKey, entryDateKey) {
  const [y1, m1, d1] = String(startDateKey).split("-").map(Number);
  const [y2, m2, d2] = String(entryDateKey).split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 1;
  const start = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  if (end < start) return null;
  const diffDays = Math.floor((end - start) / 86400000) + 1;
  return Math.max(1, Math.min(30, diffDays));
}

/** Calendar key for a diary row: logged date for logs, else local date from `createdAt`. */
function diaryEntryDateKey(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.loggedDateKey) {
    const k = String(entry.loggedDateKey).trim();
    return k || null;
  }
  if (entry.createdAt) return toDateKey(new Date(entry.createdAt));
  return null;
}

function earliestDiaryDateKey(diary) {
  if (!Array.isArray(diary) || diary.length === 0) return null;
  let min = null;
  for (const e of diary) {
    const k = diaryEntryDateKey(e);
    if (!k) continue;
    if (min == null || k < min) min = k;
  }
  return min;
}

/** Day 1 = first diary date when present; otherwise falls back to saved program start. */
function programProgressAnchorKey(diary, startDateFallback) {
  const fromDiary = earliestDiaryDateKey(diary);
  return fromDiary ?? startDateFallback ?? null;
}

function maxProgramDayInDiary(diary, anchorKey) {
  if (!anchorKey || !Array.isArray(diary) || diary.length === 0) return 0;
  let max = 0;
  for (const e of diary) {
    const dk = diaryEntryDateKey(e);
    if (!dk) continue;
    const d = programDayForEntry(anchorKey, dk);
    if (d != null) max = Math.max(max, d);
  }
  return max;
}

/** Recompute persisted start + completed-day stats from the diary list. */
function progressFieldsFromDiary(diary) {
  const anchor = earliestDiaryDateKey(diary);
  const maxD = maxProgramDayInDiary(diary, anchor);
  return {
    startDate: anchor,
    lastCompletedDay: maxD
  };
}

/** Newest calendar day first (logged date / entry date); same day → most recently created first. */
function sortDiaryEntriesByCalendarNewestFirst(entries) {
  if (!Array.isArray(entries)) return [];
  return [...entries].sort((a, b) => {
    const ka = diaryEntryDateKey(a) || "";
    const kb = diaryEntryDateKey(b) || "";
    if (ka !== kb) return kb.localeCompare(ka);
    const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

/** Day N in diary UI: 1 = anchor (first diary date), from entry calendar date. */
function diaryEntryProgramDayDisplay(anchorKey, entry) {
  if (!anchorKey || !entry) return null;
  const dk = diaryEntryDateKey(entry);
  if (!dk) return null;
  return programDayForEntry(anchorKey, dk);
}

function formatDateKeyDisplay(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/** `birthdayKey` is `YYYY-MM-DD` from `<input type="date">`. */
function calculateAgeFromBirthday(birthdayKey) {
  const s = String(birthdayKey || "").trim();
  if (!s) return null;
  const parts = s.split("-").map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d || parts.length !== 3) return null;
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (birth > todayStart) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

/** Age string for prompts: from birthday when set, else legacy free-text `age`. */
function ageForProfile(profile) {
  if (!profile || typeof profile !== "object") return "";
  const computed = calculateAgeFromBirthday(profile.birthday);
  if (computed != null) return String(computed);
  return String(profile.age || "").trim();
}

function dateKeyYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return toDateKey(d);
}

function diarySourceLabel(entry) {
  const s = entry.source;
  if (s === "reflection") return "Reflection";
  if (s === "log") return "Log what happened?";
  if (s === "morning" || s === "morning_reflection") return "Morning";
  const title = String(entry.title || "");
  if (/^morning reflection:/i.test(title)) return "Morning";
  if (entry.moodBefore != null && entry.moodAfter != null) return "Log what happened?";
  return "Reflection";
}

function diaryTitleDisplay(entry) {
  let t = String(entry.title || "").trim();
  t = t.replace(/^morning reflection:\s*/i, "").trim() || t;
  // Legacy rows stored title capped at 55 chars; prefer full text when still present.
  const useRawTextForTitle =
    entry.source === "log" || (entry.source == null && entry.rawText != null && !entry.scenario);
  if (useRawTextForTitle && entry.rawText != null) {
    const rt = String(entry.rawText).trim();
    if (rt) {
      if (!t) return rt;
      if (rt === t) return rt;
      if ((t.length === 55 || rt.length > t.length) && rt.startsWith(t)) return rt;
      return t;
    }
  }
  if (entry.scenario != null && (entry.source === "reflection" || entry.source == null)) {
    const sc = String(entry.scenario).trim();
    const scShow = sc.replace(/^morning reflection:\s*/i, "").trim() || sc;
    if (scShow) {
      if (!t) return scShow;
      if (scShow === t) return scShow;
      if ((t.length === 55 || scShow.length > t.length) && scShow.startsWith(t)) return scShow;
      return t;
    }
  }
  return t || "Untitled entry";
}

/** Log-style diary rows ("Log what happened?" / legacy raw-text saves). */
function isDiaryLogEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.source === "log") return true;
  if (entry.source == null && entry.rawText != null && !entry.scenario) return true;
  return false;
}

function profileToScenarioContext(profile) {
  if (!profile || typeof profile !== "object") return "";
  const entries = [
    ["Age", ageForProfile(profile)],
    ["Birthday", profile.birthday],
    ["Marital status", profile.maritalStatus],
    ["Children", profile.children],
    ["Dog", profile.dog],
    ["Partner/Girlfriend", profile.partner],
    ["Job", profile.job],
    ["Friends", profile.friends],
    ["Other personal context", profile.notes]
  ]
    .map(([label, value]) => [label, String(value || "").trim()])
    .filter(([, value]) => value.length > 0);
  return entries.map(([label, value]) => `${label}: ${value}`).join(" | ");
}

/** Summarize recurring diary themes to steer scenario generation. */
function diaryPatternContext(diary) {
  if (!Array.isArray(diary) || diary.length === 0) return "";
  const recent = diary
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, 40);
  if (recent.length === 0) return "";

  const storyCounts = {};
  const lessonCounts = {};
  const stepCounts = { step1: 0, step2: 0, step3: 0 };
  const moodBeforeCounts = {};
  const moodAfterCounts = {};

  for (const entry of recent) {
    const story = String(entry.story || "").trim();
    if (story) storyCounts[story] = (storyCounts[story] || 0) + 1;
    const lesson = String(entry.lesson || "").trim();
    if (lesson) lessonCounts[lesson] = (lessonCounts[lesson] || 0) + 1;
    for (const step of entry.triggeredSteps || []) {
      if (stepCounts[step] != null) stepCounts[step] += 1;
    }
    const before = normalizeMoodId(entry.moodBefore);
    if (before) moodBeforeCounts[before] = (moodBeforeCounts[before] || 0) + 1;
    const after = normalizeMoodId(entry.moodAfter);
    if (after) moodAfterCounts[after] = (moodAfterCounts[after] || 0) + 1;
  }

  const topN = (counts, n = 2) =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, c]) => `${k} (${c})`);

  const topStories = topN(storyCounts, 2);
  const topLessons = topN(lessonCounts, 2);
  const topSteps = topN(stepCounts, 3)
    .map((s) => s.replace("step1", "Facts vs Story").replace("step2", "Control Filter").replace("step3", "Chosen Response"));
  const topBeforeMoods = topN(moodBeforeCounts, 2).map((row) => {
    const [id, countPart] = row.split(" ");
    const m = MOOD_OPTIONS.find((opt) => opt.id === id);
    return `${m ? `${m.emoji} ${m.label}` : id} ${countPart || ""}`.trim();
  });
  const topAfterMoods = topN(moodAfterCounts, 2).map((row) => {
    const [id, countPart] = row.split(" ");
    const m = MOOD_OPTIONS.find((opt) => opt.id === id);
    return `${m ? `${m.emoji} ${m.label}` : id} ${countPart || ""}`.trim();
  });

  const lines = [
    topStories.length ? `Recurring stories: ${topStories.join(", ")}` : "",
    topLessons.length ? `Recurring lessons: ${topLessons.join(", ")}` : "",
    topSteps.length ? `Most triggered steps: ${topSteps.join(", ")}` : "",
    topBeforeMoods.length ? `Common before-moods: ${topBeforeMoods.join(", ")}` : "",
    topAfterMoods.length ? `Common after-moods: ${topAfterMoods.join(", ")}` : ""
  ].filter(Boolean);

  return lines.join(" | ").slice(0, 700);
}

function base64UrlToUint8Array(base64UrlString) {
  const padding = "=".repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function clampMood(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 5;
  return Math.max(1, Math.min(10, n));
}

/** Ordered mood list (label + emoji); ids are persisted on diary entries. */
const MOOD_OPTIONS = [
  { id: "calm", label: "Calm", emoji: "😌" },
  { id: "centered", label: "Centered", emoji: "🙂" },
  { id: "focused", label: "Focused", emoji: "🎯" },
  { id: "energized", label: "Energized", emoji: "⚡" },
  { id: "reflective", label: "Reflective", emoji: "🤔" },
  { id: "resilient", label: "Resilient", emoji: "🛡️" },
  { id: "anxious", label: "Anxious", emoji: "😰" },
  { id: "overwhelmed", label: "Overwhelmed", emoji: "😵" },
  { id: "irritated", label: "Irritated", emoji: "😤" },
  { id: "discouraged", label: "Discouraged", emoji: "😞" },
  { id: "uncertain", label: "Uncertain", emoji: "😕" },
  { id: "drained", label: "Drained", emoji: "🥱" }
];

/** Map legacy 1–10 scale onto the 12 mood slots (for old saved entries / state). */
function legacyNumberToMoodId(n) {
  const c = clampMood(n);
  const idx = Math.round(((c - 1) / 9) * 11);
  return MOOD_OPTIONS[Math.min(Math.max(idx, 0), MOOD_OPTIONS.length - 1)].id;
}

function normalizeMoodId(value) {
  if (typeof value === "number" && !Number.isNaN(value)) return legacyNumberToMoodId(value);
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return MOOD_OPTIONS[0].id;
    if (MOOD_OPTIONS.some((m) => m.id === t)) return t;
    if (/^-?\d+(\.\d+)?$/.test(t)) {
      const n = Number(t);
      if (!Number.isNaN(n)) return legacyNumberToMoodId(n);
    }
    const byLabel = MOOD_OPTIONS.find((m) => m.label.toLowerCase() === t.toLowerCase());
    if (byLabel) return byLabel.id;
  }
  return MOOD_OPTIONS[0].id;
}

/** Map legacy 1–10 numeric moods onto a 1–12 scale for trend stats. */
function legacyToUnifiedOrdinal(n) {
  const c = clampMood(n);
  return Math.round(1 + (c - 1) * (11 / 9));
}

function moodOrdinalUnified(stored) {
  if (stored == null || stored === "") return null;
  if (typeof stored === "number") {
    if (Number.isNaN(stored)) return null;
    return legacyToUnifiedOrdinal(stored);
  }
  const s = String(stored).trim();
  if (!s) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isNaN(n)) return legacyToUnifiedOrdinal(n);
  }
  let id = null;
  if (MOOD_OPTIONS.some((m) => m.id === s)) {
    id = s;
  } else {
    const byLabel = MOOD_OPTIONS.find((m) => m.label.toLowerCase() === s.toLowerCase());
    if (byLabel) id = byLabel.id;
  }
  if (!id) return null;
  const i = MOOD_OPTIONS.findIndex((m) => m.id === id);
  return i >= 0 ? i + 1 : null;
}

function formatMoodValue(stored) {
  if (stored == null) return "";
  if (typeof stored === "number") return `${clampMood(stored)}/10`;
  const opt = MOOD_OPTIONS.find((m) => m.id === stored);
  return opt ? `${opt.emoji} ${opt.label}` : String(stored);
}

function formatMoodPair(before, after) {
  return `${formatMoodValue(before)} → ${formatMoodValue(after)}`;
}

function moodEmojiForStored(stored) {
  if (stored == null || stored === "") return "";
  const id = normalizeMoodId(stored);
  const opt = MOOD_OPTIONS.find((m) => m.id === id);
  return opt ? opt.emoji : "";
}

function moodLabelForStored(stored) {
  if (stored == null || stored === "") return "";
  const id = normalizeMoodId(stored);
  const opt = MOOD_OPTIONS.find((m) => m.id === id);
  return opt ? opt.label : "";
}

/** e.g. `Reflective 🤔` — label then emoji, space between. */
function formatMoodLabelEmojiChunk(stored) {
  const label = moodLabelForStored(stored);
  const emoji = moodEmojiForStored(stored);
  if (!label && !emoji) return "—";
  return [label, emoji].filter(Boolean).join(" ");
}

function formatMoodLabelEmojiPairLine(before, after) {
  return `${formatMoodLabelEmojiChunk(before)} → ${formatMoodLabelEmojiChunk(after)}`;
}

/** Map a 1–12 ordinal (can be fractional) to the nearest MOOD_OPTIONS entry. */
function moodOptionFromOrdinal(ordinal) {
  if (ordinal == null || Number.isNaN(ordinal)) return null;
  const idx = Math.min(MOOD_OPTIONS.length - 1, Math.max(0, Math.round(ordinal) - 1));
  return MOOD_OPTIONS[idx];
}

/** Scrollable mood list for use inside the log-entry modal. */
function MoodOptionList({ value, onSelect }) {
  const selectedId = normalizeMoodId(value);
  return (
    <div
      className="max-h-[min(60vh,24rem)] space-y-2 overflow-y-auto pr-0.5"
      role="listbox"
    >
      {MOOD_OPTIONS.map((m) => {
        const isOn = selectedId === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={isOn}
            onClick={() => onSelect(m.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 ${
              isOn
                ? "border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-50"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800"
            }`}
          >
            <span>{m.label}</span>
            <span className="text-xl leading-none" aria-hidden>
              {m.emoji}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function detectSteps(text) {
  const normalized = String(text || "").toLowerCase();
  const step1Patterns = [
    "they think",
    "this means",
    "i'm not enough",
    "im not enough",
    "nobody cares",
    "no one cares",
    "always",
    "never",
    "everyone",
    "they hate me",
    "i feel rejected"
  ];
  const step2Patterns = [
    "they should",
    "it's unfair",
    "its unfair",
    "why did they",
    "they ignored me",
    "they need to"
  ];
  const step3Patterns = [
    "what do i do",
    "now what",
    "i want to text",
    "i want to quit",
    "i want to react",
    "what should i do"
  ];
  const score = (patterns) =>
    patterns.reduce((total, pattern) => total + (normalized.includes(pattern) ? 1 : 0), 0);
  const step1 = score(step1Patterns);
  const step2 = score(step2Patterns);
  const step3 = score(step3Patterns);
  const triggered = { step1: step1 > 0, step2: step2 > 0, step3: step3 > 0 };
  if (!triggered.step1 && !triggered.step2 && !triggered.step3) triggered.step1 = true;
  return triggered;
}

function StoicMarkIcon({ className = "" }) {
  return (
    <svg
      className={className}
      width={29}
      height={33}
      viewBox="0 0 29 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M19.4532 15.354C19.3348 15.4178 19.3131 15.4802 19.342 15.6107C19.4677 16.1605 19.5933 16.7132 19.7002 17.2702C19.8446 18.0534 19.2669 18.7628 18.484 18.7628C15.8409 18.7671 13.1962 18.7628 10.5531 18.7628C9.57381 18.7628 9.1954 17.8867 9.31095 17.2441C9.41494 16.6798 9.54349 16.1155 9.66194 15.5513C9.66916 15.5034 9.64316 15.4251 9.60706 15.399C9.37451 15.2423 9.1261 15.1059 8.8892 14.9464C7.38417 13.9542 6.27491 12.6211 5.62488 10.943C4.85646 8.96013 4.98215 6.98454 5.86464 5.061C6.33404 4.04705 6.99991 3.17527 7.83476 2.43259C9.25025 1.17062 10.8896 0.37861 12.763 0.0928638C13.0288 0.0522485 13.3032 0.0333906 13.5733 0.00728229C13.5733 2.93962e-05 15.5434 -0.0144758 15.8987 0.0406441C16.0691 0.066754 16.2425 0.0885129 16.4129 0.121875C18.7528 0.567205 20.7129 1.67395 22.2147 3.54223C23.2431 4.8158 23.8006 6.28956 23.8742 7.92745C23.9479 9.49113 23.5449 10.946 22.7202 12.2762C21.9027 13.5947 20.7905 14.5927 19.4559 15.3542L19.4532 15.354ZM10.8117 7.24825C9.67354 7.26711 8.7737 8.18097 8.77084 9.35443C8.76651 10.5352 9.68802 11.4302 10.8969 11.4418C12.0134 11.449 12.9826 10.4423 12.9378 9.3588C12.9898 8.33037 12.1275 7.23083 10.8117 7.24971V7.24825ZM18.103 7.24825C16.9677 7.26711 16.0693 8.18097 16.0693 9.35734C16.065 10.5381 16.9865 11.4287 18.1954 11.4403C19.3119 11.4476 20.2768 10.4409 20.2334 9.35734C20.2854 8.32892 19.4275 7.22938 18.103 7.24825Z"
        fill="currentColor"
      />
      <path
        d="M0.645509 28.4554C1.06011 28.244 1.47899 28.0385 1.89359 27.8315C2.76006 27.3968 3.62369 26.9577 4.49019 26.5216C6.20165 25.6626 7.91605 24.8066 9.63173 23.9476C9.66473 23.9284 9.69485 23.9018 9.73789 23.8722C9.56574 23.7894 9.41511 23.7214 9.26447 23.6445C6.85581 22.4336 4.45009 21.2183 2.03999 20.0075C1.55222 19.7621 1.06304 19.5196 0.578144 19.2654C0.0789242 19.0081 -0.152047 18.3753 0.107601 17.8505C0.411732 17.234 0.724463 16.616 1.00709 15.9876C1.23519 15.4805 1.85205 15.1627 2.48327 15.4923C3.30527 15.9241 4.14022 16.3395 4.9737 16.7564C6.24761 17.3922 7.52296 18.0205 8.79681 18.6607C10.6445 19.5877 12.4911 20.5191 14.3429 21.4432C14.4132 21.4772 14.5266 21.4772 14.5997 21.4432C15.0071 21.2539 15.4074 21.0529 15.8119 20.8533C17.2996 20.1111 18.783 19.3659 20.2707 18.6237C22.1844 17.6657 24.0938 16.7091 26.0075 15.7511C26.2313 15.6417 26.4522 15.5204 26.6832 15.4288C27.171 15.2395 27.6716 15.4095 27.9169 15.8871C28.2583 16.545 28.5782 17.2192 28.8939 17.8933C29.0732 18.2763 29.0258 18.6548 28.7475 18.9608C28.5897 19.1308 28.3803 19.2669 28.1708 19.3733C25.2443 20.8459 22.3165 22.311 19.3898 23.7792C19.3382 23.8058 19.2908 23.8354 19.2105 23.8783C19.298 23.9241 19.3496 23.9537 19.4013 23.9803C19.8675 24.2109 20.3338 24.4342 20.8 24.6693C22.9562 25.7515 25.1152 26.8382 27.2713 27.9249C27.6386 28.1097 28.0058 28.2915 28.3731 28.4852C28.9426 28.7839 29.1262 29.3028 28.8795 29.9046C28.825 30.0376 28.7618 30.1662 28.7001 30.2949C28.4434 30.8242 28.2009 31.3653 27.9212 31.8813C27.6529 32.3692 27.1608 32.5244 26.6544 32.3204C26.544 32.2745 26.4378 32.2213 26.3316 32.1696C25.0276 31.5191 23.7279 30.8641 22.428 30.2121C21.025 29.5084 19.6191 28.8076 18.216 28.1082C17.0296 27.5139 15.8432 26.9195 14.661 26.3178C14.5433 26.2572 14.4515 26.2572 14.3339 26.3178C13.5664 26.7081 12.7945 27.0896 12.027 27.4754C10.7417 28.123 9.45627 28.778 8.17089 29.4211C6.26864 30.3747 4.36645 31.3284 2.46408 32.279C2.25893 32.381 2.04517 32.4461 1.80991 32.3928C1.46129 32.313 1.20021 32.1208 1.0381 31.7911C0.725352 31.1583 0.416918 30.5226 0.115648 29.8868C0.056829 29.7656 0.0195322 29.6222 0.0166615 29.4891C-0.00198823 28.9939 0.251933 28.6642 0.666516 28.4527L0.645509 28.4554Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Card({ className = "", children, ...props }) {
  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
function CardHeader({ className = "", children }) {
  return <div className={`p-6 pb-3 ${className}`}>{children}</div>;
}
function CardTitle({ className = "", children }) {
  return <h3 className={`text-lg font-semibold text-slate-900 dark:text-slate-100 ${className}`}>{children}</h3>;
}
function CardDescription({ className = "", children }) {
  return <p className={`text-sm text-slate-500 dark:text-slate-400 ${className}`}>{children}</p>;
}
function CardContent({ className = "", children }) {
  return <div className={`p-6 pt-3 ${className}`}>{children}</div>;
}
function Button({ className = "", variant = "default", type = "button", children, ...props }) {
  const base = "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm transition";
  const style =
    variant === "outline"
      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200";
  return (
    <button type={type} className={`${base} ${style} ${className}`} {...props}>
      {children}
    </button>
  );
}

function ModalCloseButton({ onClick, label = "Close" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-3 top-3 z-10 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-slate-500"
      aria-label={label}
    >
      <X className="h-5 w-5" strokeWidth={2} />
    </button>
  );
}

const DIARY_MODAL_FIELDS = [
  { key: "title", label: "Title" },
  { key: "scenario", label: "Scenario" },
  { key: "fact", label: "Fact" },
  { key: "story", label: "Story" },
  { key: "chosenResponse", label: "Chosen response" },
  { key: "lesson", label: "Lesson" }
];

const diaryModalFieldLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400";

/** Read-only diary body: same sequential ceremony as Log → Trigger result (CeremonialInsightBlock). */
function DiaryEntryModalFieldsViewOnly({ fields, draft, emptyPlaceholder }) {
  const reduceMotion = useReducedMotion();
  const revealKey = useMemo(
    () =>
      [
        draft.title,
        draft.scenario,
        draft.fact,
        draft.story,
        draft.chosenResponse,
        draft.lesson
      ].join("\x1e"),
    [
      draft.title,
      draft.scenario,
      draft.fact,
      draft.story,
      draft.chosenResponse,
      draft.lesson
    ]
  );

  return (
    <div className="space-y-4">
      {fields.map(({ key, label }, sectionIndex) => {
        const raw = draft[key];
        const text = raw != null && String(raw).trim() ? String(raw) : "";
        const display = text || (emptyPlaceholder === "—" ? "" : emptyPlaceholder);
        return (
          <CeremonialInsightBlock
            key={key}
            label={label}
            text={display}
            sectionIndex={sectionIndex}
            reduceMotion={reduceMotion}
            revealKey={revealKey}
            isLesson={key === "lesson"}
          />
        );
      })}
    </div>
  );
}

/** View: ceremonial read-only (Trigger result pattern). Edit: standard boxed fields. */
function DiaryEntryModalFields({ viewOnly, draft, onFieldChange, omitTitleAndScenario }) {
  const fields = omitTitleAndScenario
    ? DIARY_MODAL_FIELDS.filter((f) => f.key !== "title" && f.key !== "scenario")
    : DIARY_MODAL_FIELDS;
  const emptyPlaceholder = omitTitleAndScenario ? "" : "—";

  if (viewOnly) {
    return <DiaryEntryModalFieldsViewOnly fields={fields} draft={draft} emptyPlaceholder={emptyPlaceholder} />;
  }

  return (
    <div className="space-y-5">
      {fields.map(({ key, label }) => (
        <section key={key} className="min-w-0">
          <label className={`block ${diaryModalFieldLabelClass}`} htmlFor={`diary-modal-${key}`}>
            {label}
          </label>
          <Textarea
            id={`diary-modal-${key}`}
            value={draft[key] ?? ""}
            onChange={(e) => onFieldChange(key, e.target.value)}
            placeholder={`${label}…`}
            className={`mt-1.5${key === "lesson" ? " font-semibold" : ""}`}
          />
        </section>
      ))}
    </div>
  );
}

function Input({ className = "", onFocus, onBlur, onChange, value, ...props }) {
  return (
    <div className="min-w-0 max-w-full">
      <input
        {...props}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${className}`}
      />
    </div>
  );
}

function LogDateControl({ id, value, min, max, onChange }) {
  const display = formatDateKeyDisplay(value || max);

  return (
    <div className="relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
      {/* Visible label; real hit target is the transparent date input on top (iOS anchors the picker here). */}
      <div
        className="pointer-events-none min-h-[2.75rem] truncate px-3 py-2 text-left text-base text-slate-900 dark:text-slate-100"
        aria-hidden="true"
      >
        {display || "Select a date"}
      </div>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        className="absolute inset-0 z-10 m-0 h-full min-h-[2.75rem] w-full cursor-pointer opacity-0"
        style={{ WebkitAppearance: "none", appearance: "none" }}
        aria-label="Choose date for this entry"
      />
    </div>
  );
}

function Textarea({ className = "", onInput, onFocus, onBlur, onChange, value, ...props }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="min-w-0 max-w-full">
      <textarea
        {...props}
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onInput={(event) => {
          event.currentTarget.style.height = "auto";
          event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
          if (onInput) onInput(event);
        }}
        className={`w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${className}`}
      />
    </div>
  );
}
function Badge({ children, className = "" }) {
  return (
    <span
      className={`rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-100 ${className}`}
    >
      {children}
    </span>
  );
}
function Progress({ value }) {
  return (
    <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700">
      <div className="h-3 rounded-full bg-slate-900 dark:bg-slate-100" style={{ width: `${value}%` }} />
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm transition ${
        active
          ? "bg-slate-900 text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
          : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      } min-w-0 flex-1 basis-0 justify-center px-2 py-3 text-xs sm:px-4 sm:text-sm md:flex-none md:justify-start`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="shrink-0 rounded-2xl bg-slate-900 p-2 text-white dark:bg-slate-100 dark:text-slate-900">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h2 className="break-words text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="break-words text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function FocusSettingsIcon({ className = "" }) {
  return (
    <svg
      width={20}
      height={19}
      viewBox="0 0 20 19"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M0.865042 5.02488H8.51313C8.78033 6.27772 9.60898 7.33831 10.76 7.8997C11.911 8.46012 13.2564 8.46012 14.4074 7.8997C15.5594 7.33827 16.3881 6.27775 16.6543 5.02488H19.135C19.6122 5.02488 20 4.63809 20 4.15983C20 3.6826 19.6122 3.29479 19.135 3.29479H16.6543C16.3881 2.04194 15.5595 0.982466 14.4074 0.421076C13.2564 -0.140359 11.911 -0.140359 10.76 0.421076C9.60907 0.982511 8.7804 2.04199 8.51313 3.29479H0.865042C0.387805 3.29479 0 3.6826 0 4.15983C0 4.63809 0.387805 5.02488 0.865042 5.02488ZM12.5846 1.72995C13.5682 1.72995 14.455 2.32259 14.8304 3.23131C15.2068 4.14003 14.9988 5.18597 14.3032 5.88056C13.6077 6.57612 12.5617 6.78406 11.6531 6.4077C10.7444 6.03028 10.1528 5.14341 10.1528 4.15992C10.1549 2.81764 11.2424 1.73115 12.5847 1.73004L12.5846 1.72995Z"
        fill="currentColor"
      />
      <path
        d="M19.0674 13.6462H11.0201C10.7529 12.3934 9.92421 11.3328 8.77317 10.7714C7.6222 10.211 6.27674 10.211 5.12579 10.7714C3.97378 11.3328 3.14514 12.3933 2.8789 13.6462H0.930472C0.453235 13.6462 0.0654297 14.033 0.0654297 14.5113C0.0654297 14.9885 0.453235 15.3763 0.930472 15.3763H2.8789C3.14507 16.6291 3.97371 17.6886 5.12579 18.25C6.27677 18.8114 7.62222 18.8114 8.77317 18.25C9.92412 17.6886 10.7528 16.6291 11.0201 15.3763H19.0674C19.5446 15.3763 19.9324 14.9885 19.9324 14.5113C19.9324 14.033 19.5446 13.6462 19.0674 13.6462ZM6.94859 16.9411C5.96502 16.9411 5.07815 16.3485 4.70281 15.4398C4.32643 14.5311 4.53438 13.4851 5.22996 12.7905C5.92552 12.095 6.97149 11.887 7.88009 12.2634C8.78881 12.6408 9.38041 13.5277 9.38041 14.5112C9.37833 15.8534 8.29079 16.9399 6.94853 16.941L6.94859 16.9411Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Footer row: optional “shared activity” on the left, Edit/Delete as children on the right. */
function DiaryEntrySharedActivityFooter({ entryId, reactionsSummary, children }) {
  const s = entryId ? reactionsSummary[entryId] : undefined;
  const has =
    s && ((s.likeCount ?? 0) > 0 || (s.commentCount ?? 0) > 0);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-600">
      <div className="flex min-w-0 flex-1 items-center">
        {has ? (
          <span
            className="inline-flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300"
            title="Someone you shared your diary with liked or commented on this entry"
            aria-label="Likes or comments from people you shared with"
          >
            <Heart className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden />
            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-400" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  );
}

function AiBadgeIcon() {
  return (
    <svg
      viewBox="0 0 26 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-7 w-7 shrink-0 text-white dark:text-slate-900"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.27022 6.07834C0.94312 5.957 0.60315 5.8616 0.252881 5.79441C0.227111 5.78954 0.201341 5.78477 0.175571 5.78009C-0.0585236 5.7382 -0.0585236 5.40146 0.175571 5.35958C0.201341 5.3549 0.227111 5.35012 0.252881 5.34526C0.60315 5.27805 0.943097 5.18266 1.27022 5.06132C1.46596 4.98872 1.65713 4.90692 1.84318 4.81629C3.1316 4.18877 4.17516 3.14191 4.80062 1.8492C4.89095 1.66254 4.97257 1.47076 5.04485 1.27427C5.1658 0.946176 5.26089 0.605119 5.32786 0.253707C5.33271 0.227853 5.33747 0.201998 5.34214 0.176144C5.38389 -0.0587147 5.71953 -0.0587147 5.76128 0.176144C5.76594 0.201998 5.7707 0.227853 5.77555 0.253707C5.84254 0.605119 5.93763 0.946176 6.05856 1.27427C6.13093 1.47075 6.21246 1.66254 6.30279 1.8492C6.92828 3.14182 7.97173 4.18879 9.26024 4.81629C9.44628 4.90692 9.63735 4.98872 9.83311 5.06132C10.1602 5.18267 10.5002 5.27807 10.8504 5.34526C10.8762 5.35012 10.902 5.3549 10.9278 5.35958C11.1618 5.40147 11.1618 5.73821 10.9278 5.78009C10.902 5.78477 10.8762 5.78954 10.8504 5.79441C10.5002 5.86161 10.1602 5.95701 9.83311 6.07834C9.63736 6.15095 9.44629 6.23275 9.26024 6.32337C7.97173 6.9509 6.92826 7.99775 6.30279 9.29047C6.21246 9.47712 6.13093 9.66882 6.05856 9.86521C5.93761 10.1934 5.84253 10.5345 5.77555 10.8859C5.7707 10.9116 5.76594 10.9376 5.76128 10.9634C5.71952 11.1983 5.38388 11.1983 5.34214 10.9634C5.33747 10.9376 5.33271 10.9116 5.32786 10.8859C5.26088 10.5345 5.16579 10.1934 5.04485 9.86521C4.97257 9.66883 4.89095 9.47713 4.80062 9.29047C4.17514 7.99775 3.13169 6.95088 1.84318 6.32337C1.65713 6.23275 1.46597 6.15095 1.27022 6.07834ZM9.09045 14.4215C8.86167 14.3598 8.62974 14.3054 8.39484 14.259C8.35811 14.2518 8.32139 14.2447 8.28457 14.2379L8.27335 14.2358L8.25826 14.233C8.23501 14.2288 8.20951 14.2242 8.15851 14.2151L8.14064 14.2118C7.7664 14.1408 7.7664 13.6031 8.14064 13.532L8.15851 13.5288C8.20951 13.5197 8.23501 13.5151 8.25826 13.5109L8.27335 13.5081L8.28457 13.506C8.32139 13.4992 8.35811 13.4921 8.39484 13.4848C8.62974 13.4385 8.86167 13.3841 9.09045 13.3223C9.28584 13.2695 9.47897 13.2111 9.66951 13.1474C12.7534 12.1161 15.1798 9.68147 16.2078 6.58776C16.2713 6.3966 16.3295 6.20284 16.3822 6.00682C16.4438 5.77728 16.4979 5.5446 16.5441 5.30893C16.5513 5.27208 16.5584 5.23524 16.5652 5.19831L16.5673 5.18705L16.5701 5.17191C16.5743 5.14885 16.5788 5.12363 16.5877 5.07354L16.588 5.07183L16.5912 5.0539C16.662 4.67844 17.1979 4.67844 17.2688 5.0539L17.272 5.07183C17.2811 5.123 17.2856 5.14858 17.2899 5.17191L17.2926 5.18704L17.2947 5.19831C17.3015 5.23524 17.3086 5.27208 17.3158 5.30893C17.3621 5.5446 17.4162 5.77729 17.4778 6.00682C17.5305 6.20284 17.5887 6.3966 17.6522 6.58776C18.6801 9.6817 21.1068 12.1161 24.1905 13.1474C24.381 13.2111 24.5741 13.2695 24.7695 13.3223C24.9983 13.3841 25.2302 13.4384 25.4651 13.4848C25.5018 13.492 25.5386 13.4992 25.5754 13.506L25.5866 13.5081L25.6017 13.5109C25.625 13.5151 25.6505 13.5197 25.7015 13.5288L25.7193 13.532C26.0936 13.6031 26.0936 14.1408 25.7193 14.2118L25.7015 14.2151L25.6475 14.2247L25.6017 14.233L25.5866 14.2358L25.5754 14.2379C25.5386 14.2447 25.5018 14.2518 25.4651 14.259C25.2302 14.3054 24.9983 14.3598 24.7695 14.4215C24.5741 14.4744 24.381 14.5328 24.1905 14.5965C21.1066 15.6278 18.6801 18.0624 17.6522 21.1561C17.5887 21.3473 17.5305 21.541 17.4778 21.7371C17.4162 21.9666 17.3621 22.1993 17.3158 22.4349C17.3086 22.4718 17.3015 22.5086 17.2947 22.5456L17.2926 22.5568L17.2899 22.572L17.2837 22.606L17.2724 22.6701L17.2688 22.69C17.1979 23.0654 16.662 23.0654 16.5912 22.69L16.588 22.6721C16.5789 22.621 16.5743 22.5952 16.5701 22.572L16.5673 22.5568L16.5652 22.5456C16.5584 22.5086 16.5513 22.4718 16.5441 22.4349C16.4979 22.1993 16.4438 21.9666 16.3822 21.7371C16.3294 21.541 16.2713 21.3473 16.2078 21.1561C15.1798 18.0622 12.7531 15.6278 9.6695 14.5965C9.47897 14.5328 9.28584 14.4744 9.09045 14.4215ZM3.92907 21.6241C4.32243 21.6995 4.69507 21.8314 5.03835 22.0112C5.19108 22.0912 5.33798 22.1806 5.47824 22.2788C5.86929 22.5523 6.20914 22.8933 6.48174 23.2856C6.57961 23.4263 6.66877 23.5736 6.74843 23.7269C6.92765 24.0713 7.05911 24.4451 7.13426 24.8398C7.1374 24.8561 7.14045 24.8724 7.14333 24.8888C7.16972 25.0371 7.38172 25.0371 7.40813 24.8888C7.411 24.8724 7.41397 24.8561 7.41711 24.8398C7.49226 24.4451 7.62372 24.0713 7.80294 23.7269C7.88267 23.5736 7.97184 23.4263 8.06963 23.2856C8.34222 22.8933 8.68217 22.5523 9.07313 22.2788C9.21338 22.1806 9.36027 22.0912 9.51302 22.0112C9.8563 21.8314 10.2289 21.6995 10.6223 21.6241C10.6386 21.621 10.6548 21.618 10.6711 21.615C10.8189 21.5886 10.8189 21.3759 10.6711 21.3495C10.6548 21.3465 10.6386 21.3435 10.6223 21.3404C10.2289 21.265 9.8563 21.1331 9.51302 20.9533C9.36028 20.8733 9.21339 20.7839 9.07313 20.6857C8.68217 20.4122 8.34222 20.0712 8.06963 19.6789C7.97184 19.5382 7.88268 19.3908 7.80294 19.2376C7.62371 18.8932 7.49225 18.5194 7.41711 18.1247C7.41397 18.1084 7.411 18.0921 7.40813 18.0757C7.38173 17.9274 7.16974 17.9274 7.14333 18.0757C7.14045 18.0921 7.1374 18.1084 7.13426 18.1247C7.0591 18.5194 6.92765 18.8932 6.74843 19.2376C6.66878 19.3908 6.57962 19.5382 6.48174 19.6789C6.20914 20.0712 5.86926 20.4122 5.47824 20.6857C5.33799 20.7839 5.19109 20.8733 5.03835 20.9533C4.69507 21.1331 4.32243 21.265 3.92907 21.3404C3.91281 21.3435 3.89656 21.3465 3.88022 21.3495C3.73242 21.3758 3.73242 21.5886 3.88022 21.615C3.89656 21.618 3.91281 21.621 3.92907 21.6241Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Shared word-by-word reveal; empty content shows an em dash. */
function StaggeredWords({
  text,
  reduceMotion,
  className = "",
  baseDelay = 0,
  wordStagger = 0.038,
  yOffset = 8
}) {
  const t = String(text ?? "").trim();
  if (!t) {
    return (
      <span className="italic text-slate-400 dark:text-slate-500" aria-hidden>
        —
      </span>
    );
  }
  if (reduceMotion) {
    return <span className={className}>{t}</span>;
  }
  const parts = t.split(/(\s+)/);
  let wi = 0;
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) {
          return <span key={`sp-${i}`}>{part}</span>;
        }
        const delay = baseDelay + Math.min(wi++ * wordStagger, 2.2);
        return (
          <motion.span
            key={`w-${i}`}
            initial={{ opacity: 0, y: yOffset }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.48, ease: [0.19, 1, 0.32, 1] }}
            className="inline-block align-baseline"
          >
            {part}
          </motion.span>
        );
      })}
    </span>
  );
}

function LogTriggerStepsReveal({ analysis, reduceMotion }) {
  const items = [
    analysis.step1 ? "Step 1: Facts vs Story" : null,
    analysis.step2 ? "Step 2: Control Filter" : null,
    analysis.step3 ? "Step 3: Chosen Response" : null
  ].filter(Boolean);
  if (items.length === 0) return null;
  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-slate-50 p-4 ring-1 ring-emerald-300/45 dark:from-emerald-950/35 dark:via-slate-800 dark:to-slate-900 dark:ring-emerald-800/35"
    >
      {!reduceMotion && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/65 to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "center" }}
        />
      )}
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-emerald-800 dark:text-emerald-300">
        Triggered steps
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((label, i) => (
          <motion.span
            key={label}
            initial={reduceMotion ? undefined : { opacity: 0, scale: 0.9, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              delay: reduceMotion ? 0 : 0.06 + i * 0.09,
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1]
            }}
            className="inline-block"
          >
            <Badge>{label}</Badge>
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

/** Seconds: first insight starts after trigger-step card; then each row; extra beat before Lesson. */
const INSIGHT_SEQUENCE_FIRST = 0.92;
const INSIGHT_SEQUENCE_GAP = 0.72;
const INSIGHT_LESSON_EXTRA = 0.42;
const INSIGHT_TEXT_AFTER_ROW = 0.36;

function CeremonialInsightBlock({ label, text, sectionIndex, reduceMotion, revealKey, isLesson }) {
  const lineKey = `${revealKey}-${label}`;
  const isLessonRow = Boolean(isLesson || label === "Lesson");
  const blockEnterDelay = reduceMotion
    ? 0.06 * sectionIndex
    : INSIGHT_SEQUENCE_FIRST +
      sectionIndex * INSIGHT_SEQUENCE_GAP +
      (isLessonRow ? INSIGHT_LESSON_EXTRA : 0);
  const wordBaseDelay = reduceMotion ? 0 : blockEnterDelay + INSIGHT_TEXT_AFTER_ROW;

  const Icon = isLessonRow ? BookOpen : Sparkles;

  return (
    <motion.section
      initial={
        reduceMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              y: 40,
              scale: 0.9,
              filter: "blur(12px)",
              rotateX: 6
            }
      }
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", rotateX: 0 }}
      transition={{
        delay: blockEnterDelay,
        duration: reduceMotion ? 0.28 : isLessonRow ? 0.78 : 0.62,
        ease: [0.15, 1, 0.28, 1]
      }}
      style={reduceMotion ? undefined : { perspective: 1200 }}
      className={
        isLessonRow
          ? "relative overflow-hidden rounded-2xl border-l-4 border-amber-400 bg-gradient-to-br from-amber-50 via-amber-50/90 to-emerald-50/50 p-4 pl-3 shadow-lg shadow-amber-500/15 ring-2 ring-amber-400/45 dark:border-amber-500 dark:from-amber-950/50 dark:via-slate-900 dark:to-emerald-950/40 dark:shadow-amber-900/20 dark:ring-amber-500/35"
          : "relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/35 p-4 ring-1 ring-emerald-200/40 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/25 dark:ring-emerald-900/30"
      }
    >
      {!reduceMotion && (
        <motion.div
          key={lineKey}
          aria-hidden
          className={
            isLessonRow
              ? "pointer-events-none absolute inset-x-6 top-0 h-[3px] bg-gradient-to-r from-transparent via-amber-400/85 to-transparent"
              : "pointer-events-none absolute inset-x-6 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
          }
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{
            delay: blockEnterDelay + 0.06,
            duration: isLessonRow ? 1.05 : 0.88,
            ease: [0.2, 1, 0.36, 1]
          }}
          style={{ transformOrigin: "center" }}
        />
      )}
      <div className="flex gap-3">
        <motion.div
          className={
            isLessonRow
              ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-amber-400/70 bg-gradient-to-br from-amber-100 to-amber-200/80 text-xs font-bold tabular-nums text-amber-950 shadow-md shadow-amber-600/20 dark:border-amber-400 dark:from-amber-900/80 dark:to-amber-950 dark:text-amber-50"
              : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-100/70 text-[11px] font-bold tabular-nums text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-100"
          }
          initial={reduceMotion ? undefined : { scale: 0, rotate: -18 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            delay: blockEnterDelay + 0.12,
            type: "spring",
            stiffness: 280,
            damping: 19
          }}
          aria-hidden
        >
          {String(sectionIndex + 1).padStart(2, "0")}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon
              className={
                isLessonRow
                  ? "h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
                  : "h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              }
              aria-hidden
            />
            <h3
              className={
                isLessonRow
                  ? "text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-900 dark:text-amber-100"
                  : "text-[10px] font-medium uppercase tracking-[0.22em] text-emerald-800/90 dark:text-emerald-300/95"
              }
            >
              {label}
            </h3>
          </div>
          {isLessonRow ? (
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.28em] text-amber-800/80 dark:text-amber-200/90">
              Your takeaway
            </p>
          ) : null}
          <div
            className={
              isLessonRow
                ? "mt-3 text-lg font-semibold leading-snug tracking-tight text-amber-950 dark:text-amber-50 sm:text-xl"
                : "mt-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-100"
            }
          >
            <StaggeredWords
              text={text}
              reduceMotion={reduceMotion}
              className="break-words [overflow-wrap:anywhere]"
              baseDelay={wordBaseDelay}
              wordStagger={isLessonRow ? 0.055 : 0.038}
              yOffset={isLessonRow ? 14 : 8}
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/** One row in the shared-diary list: gradient frame, step orb, scenario + lesson callouts (Trigger-result feel). */
function SharedDiaryListEntryCard({ entry, index, entryProgramDay, rc, onOpen }) {
  const reduceMotion = useReducedMotion();
  const listDelay = reduceMotion ? 0.05 * index : 0.12 + index * 0.11;

  const title = diaryTitleDisplay(entry);
  const source = diarySourceLabel(entry);
  const dateBits = [
    entry.loggedDateKey
      ? formatDateKeyDisplay(entry.loggedDateKey)
      : entry.createdAt
        ? new Date(entry.createdAt).toLocaleDateString()
        : "",
    entryProgramDay != null ? `Day ${entryProgramDay}` : ""
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.article
      layout
      initial={reduceMotion ? undefined : { opacity: 0, y: 26, scale: 0.97, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ delay: listDelay, duration: 0.55, ease: [0.15, 1, 0.28, 1] }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/35 p-4 ring-1 ring-emerald-200/45 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/30 dark:ring-emerald-900/35"
    >
      {!reduceMotion && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-5 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: listDelay + 0.04, duration: 0.8, ease: [0.2, 1, 0.36, 1] }}
          style={{ transformOrigin: "center" }}
        />
      )}
      <div className="flex gap-3">
        <motion.div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-300/55 bg-emerald-100/70 text-[11px] font-bold tabular-nums text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/45 dark:text-emerald-100"
          initial={reduceMotion ? undefined : { scale: 0, rotate: -14 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            delay: listDelay + 0.07,
            type: "spring",
            stiffness: 280,
            damping: 18
          }}
          aria-hidden
        >
          {String(index + 1).padStart(2, "0")}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-800/90 dark:text-emerald-300/90">
              {source}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="mt-1.5 w-full rounded-xl px-1 text-left transition hover:bg-emerald-500/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/45 dark:hover:bg-emerald-400/8"
          >
            <span className="block whitespace-pre-wrap break-words text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
              {title}
            </span>
          </button>
          {dateBits ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{dateBits}</p>
          ) : null}
          {rc ? (
            <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                {rc.likeCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                {rc.commentCount}
              </span>
            </p>
          ) : null}
          {entry.scenario && entry.source !== "reflection" ? (
            <div className="mt-3 rounded-xl border border-emerald-200/65 bg-white/70 px-3 py-2 dark:border-emerald-800/45 dark:bg-slate-900/45">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-800/85 dark:text-emerald-300/85">
                Scenario
              </p>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">
                {entry.scenario}
              </p>
            </div>
          ) : null}
          {entry.moodBefore != null && entry.moodAfter != null ? (
            <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              Mood · {formatMoodPair(entry.moodBefore, entry.moodAfter)}
            </p>
          ) : null}
          {entry.lesson ? (
            <div className="mt-3 rounded-xl border border-amber-300/75 bg-gradient-to-br from-amber-50/95 to-amber-100/45 px-3 py-2.5 shadow-sm shadow-amber-600/10 dark:border-amber-600/45 dark:from-amber-950/55 dark:to-amber-950/25 dark:shadow-amber-900/20">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-900 dark:text-amber-200">
                Lesson
              </p>
              <p className="mt-1 line-clamp-4 text-sm font-semibold leading-snug text-amber-950 dark:text-amber-50">
                {entry.lesson}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">No lesson logged.</p>
          )}
        </div>
      </div>
    </motion.article>
  );
}

/** Ceremonial staggered reveal for the daily variable scenario (respects reduced motion). */
function DailyScenarioReveal({ text, reduceMotion }) {
  if (!text?.trim()) {
    return (
      <p className="mt-3 text-lg italic text-slate-500 dark:text-slate-400" aria-hidden>
        …
      </p>
    );
  }
  if (reduceMotion) {
    return (
      <p className="mt-3 break-words pr-8 text-2xl font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">
        {text}
      </p>
    );
  }
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={text}
        role="status"
        aria-live="polite"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, filter: "blur(6px)" }}
        transition={{ duration: 0.28 }}
        className="mt-3 pr-8"
      >
        <p className="break-words text-2xl font-semibold leading-snug tracking-tight text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">
          <StaggeredWords text={text} reduceMotion={false} />
        </p>
      </motion.div>
    </AnimatePresence>
  );
}

/** Ceremonial blur + stagger reveal for AI journal pattern read (Progress tab). */
function DiaryInsightsReveal({ insights, reduceMotion }) {
  const revealKey = useMemo(
    () =>
      [
        insights.overview,
        ...(Array.isArray(insights.patterns) ? insights.patterns : []),
        insights.caveat ?? "",
        insights.source ?? "",
        insights.fallbackReason ?? ""
      ].join("\x1e"),
    [insights]
  );

  if (reduceMotion) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700 dark:text-slate-300">{insights.overview}</p>
        {Array.isArray(insights.patterns) && insights.patterns.length > 0 && (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-400">
            {insights.patterns.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {insights.caveat && (
          <p className="text-xs text-slate-500 dark:text-slate-500">{insights.caveat}</p>
        )}
        {insights.source === "fallback" && (
          <p className="text-xs text-amber-800 dark:text-amber-300/90">
            {insights.fallbackReason === "missing_api_key" || insights.fallbackReason == null
              ? "The deployed server doesn’t have ANTHROPIC_API_KEY (a local .env file is not used on Vercel). Add it under Project → Settings → Environment Variables for Production, redeploy, then Refresh."
              : insights.fallbackReason === "anthropic_http"
                ? "Anthropic returned an error (model name, billing, or rate limit). Check Vercel function logs; try Refresh in a moment."
                : insights.fallbackReason === "parse_error" || insights.fallbackReason === "empty_ai"
                  ? "The model reply couldn’t be used. Tap Refresh."
                  : "Showing the on-device summary instead of the full AI read."}
          </p>
        )}
      </div>
    );
  }

  const patternCount = Array.isArray(insights.patterns) ? insights.patterns.length : 0;
  const caveatDelay = 0.42 + patternCount * 0.09;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={revealKey}
        role="region"
        aria-label="AI pattern read"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, filter: "blur(8px)" }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-3 overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/50 to-slate-50/90 p-4 shadow-sm ring-1 ring-emerald-200/35 dark:border-emerald-800/55 dark:from-slate-900 dark:via-emerald-950/25 dark:to-slate-900 dark:ring-emerald-900/25"
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.06, duration: 0.85, ease: [0.2, 1, 0.36, 1] }}
          style={{ transformOrigin: "center" }}
        />
        <div className="flex items-center gap-2">
          <motion.div
            initial={{ scale: 0, rotate: -18 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.08 }}
            aria-hidden
          >
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </motion.div>
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-emerald-800 dark:text-emerald-300">
            Your pattern read
          </p>
        </div>
        <motion.p
          className="mt-3 text-sm leading-relaxed text-slate-800 dark:text-slate-100"
          initial={{ opacity: 0, filter: "blur(12px)", y: 10 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{ delay: 0.12, duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
        >
          {insights.overview}
        </motion.p>
        {patternCount > 0 && (
          <ul className="mt-4 space-y-2.5">
            {insights.patterns.map((p, i) => (
              <motion.li
                key={`${i}-${p.slice(0, 48)}`}
                className="flex gap-2.5 text-sm text-slate-700 dark:text-slate-300"
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.28 + i * 0.09,
                  duration: 0.48,
                  ease: [0.22, 1, 0.36, 1]
                }}
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)] dark:bg-emerald-400" aria-hidden />
                <span className="min-w-0 leading-relaxed">{p}</span>
              </motion.li>
            ))}
          </ul>
        )}
        {insights.caveat && (
          <motion.p
            className="mt-4 border-t border-emerald-200/50 pt-3 text-xs text-slate-500 dark:border-emerald-800/40 dark:text-slate-400"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: caveatDelay, duration: 0.4 }}
          >
            {insights.caveat}
          </motion.p>
        )}
        {insights.source === "fallback" && (
          <motion.p
            className="mt-3 text-xs text-amber-800 dark:text-amber-300/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: caveatDelay + (insights.caveat ? 0.08 : 0), duration: 0.35 }}
          >
            {insights.fallbackReason === "missing_api_key" || insights.fallbackReason == null
              ? "The deployed server doesn’t have ANTHROPIC_API_KEY (a local .env file is not used on Vercel). Add it under Project → Settings → Environment Variables for Production, redeploy, then Refresh."
              : insights.fallbackReason === "anthropic_http"
                ? "Anthropic returned an error (model name, billing, or rate limit). Check Vercel function logs; try Refresh in a moment."
                : insights.fallbackReason === "parse_error" || insights.fallbackReason === "empty_ai"
                  ? "The model reply couldn’t be used. Tap Refresh."
                  : "Showing the on-device summary instead of the full AI read."}
          </motion.p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default function ResilienceApp() {
  const { user: clerkUser } = useUser();
  const reduceMotion = useReducedMotion();
  const [app, setApp] = useState(DEFAULT_STATE);
  /** Ref + state: block PUT /api/state until first GET /api/state attempt finishes (avoids racing empty defaults over server diary). */
  const initialStateLoadedRef = useRef(false);
  const [initialStateLoaded, setInitialStateLoaded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("home");
  const [isFocusOpen, setIsFocusOpen] = useState(true);
  const [dailyScenario, setDailyScenario] = useState("");
  const [dailyScenarioSource, setDailyScenarioSource] = useState("fallback");
  const [dailyScenarioCategory, setDailyScenarioCategory] = useState("");
  const [isRefreshingScenario, setIsRefreshingScenario] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isMoodModalOpen, setIsMoodModalOpen] = useState(false);
  /** "before" | "after" when picking mood for log / diary save flow */
  const [logMoodPicker, setLogMoodPicker] = useState(null);
  /** Same for Review diary entry modal (separate from log so flows do not clash). */
  const [diaryEditMoodPicker, setDiaryEditMoodPicker] = useState(null);
  const [reminderDraft, setReminderDraft] = useState("08:00");
  const [isPrefillingReflection, setIsPrefillingReflection] = useState(false);
  const [selectedProgressDate, setSelectedProgressDate] = useState(null);
  const [isDiaryEditModalOpen, setIsDiaryEditModalOpen] = useState(false);
  /** Title tap opens read-only; Review opens full edit. */
  const [diaryEntryModalViewOnly, setDiaryEntryModalViewOnly] = useState(false);
  const [editingDiaryId, setEditingDiaryId] = useState(null);
  const [editingDiaryDraft, setEditingDiaryDraft] = useState({
    title: "",
    scenario: "",
    fact: "",
    story: "",
    chosenResponse: "",
    lesson: "",
    moodBefore: "reflective",
    moodAfter: "centered"
  });
  const [lastDeletedDiaryEntry, setLastDeletedDiaryEntry] = useState(null);
  const deleteUndoTimerRef = useRef(null);
  const [latestCommit, setLatestCommit] = useState(null);
  const [latestCommitUrl, setLatestCommitUrl] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [profileDraft, setProfileDraft] = useState(DEFAULT_STATE.personalProfile);
  const [profileSavedFeedback, setProfileSavedFeedback] = useState(false);
  const profileSavedTimerRef = useRef(null);
  const focusPanelContentRef = useRef(null);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionScenario, setReflectionScenario] = useState("");
  const [reflection, setReflection] = useState({
    reaction: "",
    facts: "",
    story: "",
    outsideControl: "",
    insideControl: "",
    chosenResponse: "",
    intention: ""
  });
  const [eventText, setEventText] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [eventForm, setEventForm] = useState({
    fact: "",
    story: "",
    outsideControl: "",
    insideControl: "",
    chosenResponse: "",
    lesson: "",
    moodBefore: "reflective",
    moodAfter: "centered"
  });
  const [logEntryDateKey, setLogEntryDateKey] = useState(() => toDateKey(new Date()));
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharingSettings, setSharingSettings] = useState(null);
  const [sharingLoadError, setSharingLoadError] = useState(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [grantEmailInput, setGrantEmailInput] = useState("");
  const [grantAdvancedUserIdInput, setGrantAdvancedUserIdInput] = useState("");
  const [shareDisplayNameDraft, setShareDisplayNameDraft] = useState("");
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  /** @type {{ userId: string, email: string, label: string }[]} */
  const [sharingRegisteredUsers, setSharingRegisteredUsers] = useState([]);
  const [sharingRegisteredUsersLoading, setSharingRegisteredUsersLoading] = useState(false);
  const [sharingRegisteredUsersError, setSharingRegisteredUsersError] = useState(null);
  const [sharedDiariesItems, setSharedDiariesItems] = useState([]);
  const [sharedDiariesUnavailable, setSharedDiariesUnavailable] = useState(false);
  const [sharedDiaryModalOpen, setSharedDiaryModalOpen] = useState(false);
  const [sharedDiaryOwnerId, setSharedDiaryOwnerId] = useState("");
  const [sharedDiaryOwnerLabel, setSharedDiaryOwnerLabel] = useState("");
  const [sharedDiaryEntries, setSharedDiaryEntries] = useState([]);
  const [sharedDiaryLoading, setSharedDiaryLoading] = useState(false);
  const [sharedDiaryError, setSharedDiaryError] = useState(null);
  const [sharedEntryViewOpen, setSharedEntryViewOpen] = useState(false);
  const [sharedViewingEntry, setSharedViewingEntry] = useState(null);
  const [sharedViewingDraft, setSharedViewingDraft] = useState(null);
  const [sharedViewingOmitTitleScenario, setSharedViewingOmitTitleScenario] = useState(false);
  /** @type {Record<string, { likeCount: number; commentCount: number }>} */
  const [sharedEntryReactionCounts, setSharedEntryReactionCounts] = useState({});
  const [sharedEntryReactionsDetail, setSharedEntryReactionsDetail] = useState(null);
  const [sharedReactionsBusy, setSharedReactionsBusy] = useState(false);
  const [sharedCommentDraft, setSharedCommentDraft] = useState("");
  const [ownerEntryReactions, setOwnerEntryReactions] = useState(null);
  const [ownerReactionsLoading, setOwnerReactionsLoading] = useState(false);
  /** entryId → counts from GET /api/me/sharing/reactions (summary) for diary list indicators */
  const [diaryEntryReactionsSummary, setDiaryEntryReactionsSummary] = useState({});
  const [diaryInsights, setDiaryInsights] = useState(null);
  const [diaryInsightsLoading, setDiaryInsightsLoading] = useState(false);
  const [diaryInsightsError, setDiaryInsightsError] = useState(null);
  const diaryInsightsReqIdRef = useRef(0);
  const [unshakenVideoOpen, setUnshakenVideoOpen] = useState(false);
  const unshakenVideoRef = useRef(null);
  const diaryEditModalWasOpenRef = useRef(false);
  const isAnyModalOpen =
    reflectionOpen ||
    isReminderModalOpen ||
    isMoodModalOpen ||
    isDiaryEditModalOpen ||
    Boolean(logMoodPicker) ||
    Boolean(diaryEditMoodPicker) ||
    isShareModalOpen ||
    sharedDiaryModalOpen ||
    sharedEntryViewOpen ||
    unshakenVideoOpen;

  useEffect(() => {
    if (typeof document === "undefined" || !isAnyModalOpen) return undefined;

    const html = document.documentElement;
    const { body } = document;
    const scrollY = window.scrollY;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      window.scrollTo(0, scrollY);
    };
  }, [isAnyModalOpen]);

  useEffect(() => {
    if (!sharingSettings) return;
    setShareDisplayNameDraft(
      typeof sharingSettings.shareDisplayName === "string" ? sharingSettings.shareDisplayName : ""
    );
  }, [sharingSettings]);

  const sharingGrantPickerRows = useMemo(() => {
    const granted = new Set((sharingSettings?.grants ?? []).map((g) => g.userId));
    return sharingRegisteredUsers.filter((u) => !granted.has(u.userId));
  }, [sharingRegisteredUsers, sharingSettings?.grants]);

  useEffect(() => {
    if (!isShareModalOpen) return;
    let cancelled = false;
    setSharingRegisteredUsersLoading(true);
    setSharingRegisteredUsersError(null);
    void (async () => {
      try {
        const res = await fetch("/api/me/sharing/registered-users", { cache: "no-store" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) {
            setSharingRegisteredUsers([]);
            setSharingRegisteredUsersError(
              typeof err?.error === "string" ? err.error : "Could not load registered users."
            );
          }
          return;
        }
        const data = await res.json();
        const list = Array.isArray(data?.users) ? data.users : [];
        if (!cancelled) {
          setSharingRegisteredUsers(list);
          setSharingRegisteredUsersError(null);
        }
      } catch {
        if (!cancelled) {
          setSharingRegisteredUsers([]);
          setSharingRegisteredUsersError("Could not load registered users.");
        }
      } finally {
        if (!cancelled) setSharingRegisteredUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isShareModalOpen]);

  useEffect(() => {
    if (unshakenVideoOpen) return;
    if (unshakenVideoRef.current) {
      unshakenVideoRef.current.pause();
      unshakenVideoRef.current.currentTime = 0;
    }
  }, [unshakenVideoOpen]);

  function savePersonalProfile() {
    const birthday = String(profileDraft.birthday || "").trim();
    const computedAge = calculateAgeFromBirthday(birthday);
    const nextProfile = {
      birthday,
      age: birthday && computedAge != null ? String(computedAge) : String(profileDraft.age || "").trim(),
      maritalStatus: String(profileDraft.maritalStatus || "").trim(),
      children: String(profileDraft.children || "").trim(),
      dog: String(profileDraft.dog || "").trim(),
      partner: String(profileDraft.partner || "").trim(),
      job: String(profileDraft.job || "").trim(),
      friends: String(profileDraft.friends || "").trim(),
      notes: String(profileDraft.notes || "").trim()
    };
    setAndPersist((prev) => ({
      ...prev,
      personalProfile: nextProfile
    }));
    setProfileSavedFeedback(true);
    if (profileSavedTimerRef.current) {
      clearTimeout(profileSavedTimerRef.current);
    }
    profileSavedTimerRef.current = setTimeout(() => {
      setProfileSavedFeedback(false);
    }, 1800);
    if (initialStateLoadedRef.current) void loadDailyScenario(nextProfile);
  }

  async function refreshVersionInfo() {
    try {
      const response = await fetch("/api/version", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setLatestCommit(payload?.commit || null);
      setLatestCommitUrl(payload?.url || "");
    } catch (error) {
      console.error(error);
    }
  }

  async function persistState(nextState) {
    if (!initialStateLoadedRef.current) return;
    try {
      setSaving(true);
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextState })
      });
      if (!response.ok) throw new Error("Failed to save");
      void refreshVersionInfo();
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  function setAndPersist(updater) {
    setApp((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      void persistState(next);
      return next;
    });
  }

  async function syncPushSubscription() {
    try {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
      if (Notification.permission !== "granted") {
        setIsPushEnabled(false);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      setIsPushEnabled(Boolean(existingSubscription));
      if (existingSubscription) {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: existingSubscription.toJSON() })
        });
      }
    } catch (error) {
      console.error("syncPushSubscription failed", error);
    }
  }

  async function enablePushNotifications() {
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        return;
      }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") return;

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        console.error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey)
        }));

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() })
      });

      setIsPushEnabled(true);
    } catch (error) {
      console.error("enablePushNotifications failed", error);
      setIsPushEnabled(false);
    }
  }

  async function disablePushNotifications() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setIsPushEnabled(false);
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint })
      });
      setIsPushEnabled(false);
    } catch (error) {
      console.error("disablePushNotifications failed", error);
    }
  }

  useEffect(() => {
    const storedTheme = localStorage.getItem("resilience-theme");
    setIsDarkMode(storedTheme ? storedTheme === "dark" : true);
    const storedFocusState = localStorage.getItem("resilience-focus-open");
    if (storedFocusState) {
      setIsFocusOpen(storedFocusState === "true");
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    localStorage.setItem("resilience-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsClient(true);
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => syncPushSubscription())
        .catch((error) => console.error("Service worker registration failed", error));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (notificationPermission !== "granted") return;

    const reminderAs24 = displayTo24HourTime(app.reminderTime);
    const [targetHour, targetMinute] = reminderAs24.split(":").map(Number);
    const key = `resilience-foreground-reminder-${toDateKey(new Date())}`;

    const maybeNotify = () => {
      try {
        const now = new Date();
        if (now.getHours() === targetHour && now.getMinutes() === targetMinute) {
          if (localStorage.getItem(key) === "shown") return;
          new Notification("stoic as phuq reminder", {
            body: "Quick check-in: do your morning reflection before the day runs away."
          });
          localStorage.setItem(key, "shown");
        }
      } catch (error) {
        console.error("foreground reminder failed", error);
      }
    };

    maybeNotify();
    const intervalId = setInterval(maybeNotify, 30000);
    return () => clearInterval(intervalId);
  }, [app.reminderTime, notificationPermission]);

  useEffect(() => {
    localStorage.setItem("resilience-focus-open", String(isFocusOpen));
  }, [isFocusOpen]);

  useEffect(
    () => () => {
      if (profileSavedTimerRef.current) {
        clearTimeout(profileSavedTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    setProfileDraft({
      ...DEFAULT_STATE.personalProfile,
      ...(app.personalProfile || {})
    });
  }, [app.personalProfile]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    async function loadState() {
      try {
        const response = await fetch("/api/state", { cache: "no-store", signal: controller.signal });
        if (cancelled) return;
        if (!response.ok) {
          if (response.status === 401) {
            console.warn("/api/state: unauthorized — using local default until signed in.");
          } else {
            console.warn(`/api/state: ${response.status} — using local default.`);
          }
          return;
        }
        const payload = await response.json();
        if (cancelled) return;
        setApp(normalizeAppState(payload?.state));
      } catch (error) {
        if (error?.name !== "AbortError") console.error(error);
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) {
          initialStateLoadedRef.current = true;
          setInitialStateLoaded(true);
        }
      }
    }

    void loadState();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSharedList() {
      try {
        const response = await fetch("/api/shared-diaries", { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 503) {
          setSharedDiariesUnavailable(true);
          setSharedDiariesItems([]);
          return;
        }
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setSharedDiariesUnavailable(false);
        setSharedDiariesItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!cancelled) setSharedDiariesItems([]);
      }
    }
    void loadSharedList();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayDateKey = toDateKey(new Date());
  const programAnchorKey = useMemo(
    () => programProgressAnchorKey(app.diary, app.startDate),
    [app.diary, app.startDate]
  );
  const currentProgramDay = useMemo(() => programDayFromStart(programAnchorKey), [programAnchorKey]);
  const logEntryPreviewStart = useMemo(
    () =>
      programAnchorKey
        ? logEntryDateKey < programAnchorKey
          ? logEntryDateKey
          : programAnchorKey
        : logEntryDateKey,
    [programAnchorKey, logEntryDateKey]
  );
  const logEntryPreviewDay = useMemo(
    () => programDayForEntry(logEntryPreviewStart, logEntryDateKey),
    [logEntryPreviewStart, logEntryDateKey]
  );

  const diaryEntriesSorted = useMemo(
    () => sortDiaryEntriesByCalendarNewestFirst(app.diary),
    [app.diary]
  );

  const diaryEntryIdsKey = useMemo(
    () =>
      app.diary
        .map((e) => (e && e.id ? String(e.id) : ""))
        .filter(Boolean)
        .sort()
        .join("|"),
    [app.diary]
  );

  const loadDiaryEntryReactionsSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/me/sharing/reactions", { cache: "no-store" });
      if (res.status === 503) {
        setDiaryEntryReactionsSummary({});
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      for (const row of data.entries || []) {
        map[row.entryId] = {
          likeCount: row.likeCount ?? 0,
          commentCount: row.commentCount ?? 0
        };
      }
      setDiaryEntryReactionsSummary(map);
    } catch {
      setDiaryEntryReactionsSummary({});
    }
  }, []);

  /** Log tab: entries for the same calendar day as the "When did this happen?" picker (not always today). */
  const diaryEntriesForSelectedLogDate = useMemo(
    () => diaryEntriesSorted.filter((entry) => diaryEntryDateKey(entry) === logEntryDateKey),
    [diaryEntriesSorted, logEntryDateKey]
  );
  const logTabDiarySubtitle = useMemo(
    () =>
      logEntryDateKey === todayDateKey
        ? "Today's entries."
        : `Entries for ${formatDateKeyDisplay(logEntryDateKey)}.`,
    [logEntryDateKey, todayDateKey]
  );
  const diaryPatternPrompt = useMemo(() => diaryPatternContext(app.diary), [app.diary]);
  const seenScenariosPrompt = useMemo(
    () => (Array.isArray(app.scenarioHistory) ? app.scenarioHistory.slice(-25).join("\n") : ""),
    [app.scenarioHistory]
  );

  const progressDiaryEntries = useMemo(() => {
    if (!selectedProgressDate) return diaryEntriesSorted;
    return diaryEntriesSorted.filter((entry) => {
      if (entry.loggedDateKey) return entry.loggedDateKey === selectedProgressDate;
      const entryDate = new Date(entry.createdAt);
      const entryKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, "0")}-${String(
        entryDate.getDate()
      ).padStart(2, "0")}`;
      return entryKey === selectedProgressDate;
    });
  }, [diaryEntriesSorted, selectedProgressDate]);

  const editingDiaryEntryDateLabel = useMemo(() => {
    if (!editingDiaryId || !isDiaryEditModalOpen) return null;
    const entry = app.diary.find((e) => e.id === editingDiaryId);
    if (!entry) return null;
    if (entry.loggedDateKey) return formatDateKeyDisplay(entry.loggedDateKey);
    if (entry.createdAt) return new Date(entry.createdAt).toLocaleDateString();
    return null;
  }, [editingDiaryId, isDiaryEditModalOpen, app.diary]);

  const omitTitleScenarioInDiaryModal = useMemo(() => {
    if (!editingDiaryId || !isDiaryEditModalOpen) return false;
    const entry = app.diary.find((e) => e.id === editingDiaryId);
    return entry ? isDiaryLogEntry(entry) : false;
  }, [editingDiaryId, isDiaryEditModalOpen, app.diary]);

  const editingDiaryEntryMoodPair = useMemo(() => {
    if (!editingDiaryId || !isDiaryEditModalOpen) return null;
    const entry = app.diary.find((e) => e.id === editingDiaryId);
    if (!entry) return null;
    if (entry.moodBefore != null && entry.moodAfter != null) {
      return { before: entry.moodBefore, after: entry.moodAfter };
    }
    return null;
  }, [editingDiaryId, isDiaryEditModalOpen, app.diary]);

  const sharedDiaryAnchorKey = useMemo(
    () => programProgressAnchorKey(sharedDiaryEntries, null),
    [sharedDiaryEntries]
  );
  const sharedDiarySorted = useMemo(
    () => sortDiaryEntriesByCalendarNewestFirst(sharedDiaryEntries),
    [sharedDiaryEntries]
  );

  const sharedViewingDateLabel = useMemo(() => {
    if (!sharedViewingEntry) return null;
    if (sharedViewingEntry.loggedDateKey) return formatDateKeyDisplay(sharedViewingEntry.loggedDateKey);
    if (sharedViewingEntry.createdAt) return new Date(sharedViewingEntry.createdAt).toLocaleDateString();
    return null;
  }, [sharedViewingEntry]);

  const sharedViewingMoodPair = useMemo(() => {
    if (!sharedViewingEntry) return null;
    if (sharedViewingEntry.moodBefore != null && sharedViewingEntry.moodAfter != null) {
      return { before: sharedViewingEntry.moodBefore, after: sharedViewingEntry.moodAfter };
    }
    return null;
  }, [sharedViewingEntry]);

  async function loadDailyScenario(profileOverride) {
    try {
      setIsRefreshingScenario(true);
      const params = new URLSearchParams({
        day: String(currentProgramDay),
        t: String(Date.now())
      });
      const profileContext = profileToScenarioContext(profileOverride || app.personalProfile);
      if (profileContext) {
        params.set("profile", profileContext);
      }
      if (diaryPatternPrompt) {
        params.set("diaryPatterns", diaryPatternPrompt);
      }
      if (seenScenariosPrompt) {
        params.set("seenScenarios", seenScenariosPrompt);
      }
      if (dailyScenario) {
        params.set("avoid", dailyScenario);
      }
      if (dailyScenarioCategory) {
        params.set("avoidCategory", dailyScenarioCategory);
      }
      const response = await fetch(`/api/scenario?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.scenario) {
        const nextScenario = String(payload.scenario).trim();
        setDailyScenario(nextScenario);
        setDailyScenarioSource(payload.source || "fallback");
        setDailyScenarioCategory(payload.category || "");
        if (nextScenario) {
          setAndPersist((prev) => {
            const prevHistory = Array.isArray(prev.scenarioHistory) ? prev.scenarioHistory : [];
            if (prevHistory.some((s) => String(s).toLowerCase() === nextScenario.toLowerCase())) return prev;
            return {
              ...prev,
              scenarioHistory: [...prevHistory, nextScenario].slice(-2000)
            };
          });
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsRefreshingScenario(false);
    }
  }

  useEffect(() => {
    if (!initialStateLoaded) return;
    void loadDailyScenario();
  }, [currentProgramDay, diaryPatternPrompt, initialStateLoaded]);

  const todayScenario = useMemo(
    () => dailyScenario || scenarioForDay(currentProgramDay),
    [currentProgramDay, dailyScenario]
  );
  /** Re-run log “Trigger result” ceremony when analyzed fields change. */
  const triggerResultRevealKey = useMemo(
    () =>
      [
        eventForm.fact,
        eventForm.story,
        eventForm.outsideControl,
        eventForm.insideControl,
        eventForm.chosenResponse,
        eventForm.lesson
      ].join("\x1e"),
    [
      eventForm.fact,
      eventForm.story,
      eventForm.outsideControl,
      eventForm.insideControl,
      eventForm.chosenResponse,
      eventForm.lesson
    ]
  );
  const lastCompletedEffective = useMemo(
    () =>
      Math.max(app.lastCompletedDay, maxProgramDayInDiary(app.diary, programAnchorKey)),
    [app.lastCompletedDay, app.diary, programAnchorKey]
  );
  const completionPercent = useMemo(
    () => Math.round((lastCompletedEffective / 30) * 100),
    [lastCompletedEffective]
  );
  const diaryStats = useMemo(() => {
    const total = app.diary.length;

    let moodShiftSum = 0;
    let moodShiftCount = 0;
    let sumBeforeOrd = 0;
    let sumAfterOrd = 0;
    app.diary.forEach((entry) => {
      if (entry.moodBefore == null || entry.moodAfter == null) return;
      const a = moodOrdinalUnified(entry.moodBefore);
      const b = moodOrdinalUnified(entry.moodAfter);
      if (a == null || b == null) return;
      sumBeforeOrd += a;
      sumAfterOrd += b;
      moodShiftSum += b - a;
      moodShiftCount += 1;
    });
    const averageShift =
      moodShiftCount === 0 ? "0.0" : (moodShiftSum / moodShiftCount).toFixed(1);
    let averageShiftLabel = "—";
    if (moodShiftCount > 0) {
      const avgB = sumBeforeOrd / moodShiftCount;
      const avgA = sumAfterOrd / moodShiftCount;
      const optB = moodOptionFromOrdinal(avgB);
      const optA = moodOptionFromOrdinal(avgA);
      if (optB && optA) {
        averageShiftLabel = `${optB.emoji} ${optB.label} → ${optA.emoji} ${optA.label}`;
      }
    }

    return {
      total,
      averageShift,
      averageShiftLabel,
      moodShiftSampleCount: moodShiftCount
    };
  }, [app.diary]);

  const diaryInsightsPayload = useMemo(() => {
    return app.diary
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 60)
      .map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        source: e.source,
        story: String(e.story || "").slice(0, 500),
        fact: String(e.fact || "").slice(0, 300),
        lesson: String(e.lesson || "").slice(0, 300),
        scenario: String(e.scenario || "").slice(0, 300),
        moodBefore: e.moodBefore,
        moodAfter: e.moodAfter,
        triggeredSteps: e.triggeredSteps,
        rawText: String(e.rawText || "").slice(0, 400)
      }));
  }, [app.diary]);

  const fetchDiaryInsights = useCallback(async () => {
    if (diaryInsightsPayload.length === 0) {
      setDiaryInsights(null);
      return;
    }
    const reqId = ++diaryInsightsReqIdRef.current;
    setDiaryInsightsLoading(true);
    setDiaryInsightsError(null);
    try {
      const res = await fetch("/api/diary-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: diaryInsightsPayload })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : res.statusText || "Request failed");
      }
      if (reqId !== diaryInsightsReqIdRef.current) return;
      setDiaryInsights(data);
    } catch (e) {
      if (reqId !== diaryInsightsReqIdRef.current) return;
      setDiaryInsightsError(e instanceof Error ? e.message : "Could not load insights");
    } finally {
      if (reqId === diaryInsightsReqIdRef.current) setDiaryInsightsLoading(false);
    }
  }, [diaryInsightsPayload]);

  /** Clear stale analysis when entries are added/removed; user runs Analyze again. */
  useEffect(() => {
    setDiaryInsights(null);
    setDiaryInsightsError(null);
  }, [diaryEntryIdsKey]);

  const weeklySummary = useMemo(() => {
    const focus = weekFocus(currentProgramDay);
    const messages = {
      "Facts vs Story": "You are separating what happened from what your mind adds to it.",
      "Control Filter": "You are cutting wasted energy on what is outside your control.",
      "Chosen Meaning": "You are choosing interpretations before emotion chooses for you.",
      Resilience: "You are building steadiness through repetition, not perfection."
    };
    return messages[focus];
  }, [currentProgramDay]);

  function startReflection() {
    setReflectionScenario(todayScenario);
    setReflection({
      reaction: "",
      facts: "",
      story: "",
      outsideControl: "",
      insideControl: "",
      chosenResponse: "",
      intention: ""
    });
    setReflectionOpen(true);
  }

  function prefillReflectionFromReaction(reactionText) {
    async function runPrefill() {
      const trimmed = String(reactionText || "").trim();
      if (!trimmed) return;
      try {
        setIsPrefillingReflection(true);
        const response = await fetch("/api/reflection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reaction: trimmed,
            scenario: reflectionScenario || todayScenario
          })
        });
        if (!response.ok) return;
        const payload = await response.json();
        const suggested = payload?.reflection;
        if (!suggested) return;

        setReflection((prev) => ({
          ...prev,
          facts: prev.facts || suggested.facts || "",
          story: prev.story || suggested.story || "",
          outsideControl: prev.outsideControl || suggested.outsideControl || "",
          insideControl: prev.insideControl || suggested.insideControl || "",
          chosenResponse: prev.chosenResponse || suggested.chosenResponse || "",
          intention: prev.intention || suggested.intention || ""
        }));
      } catch (error) {
        console.error(error);
      } finally {
        setIsPrefillingReflection(false);
      }
    }

    void runPrefill();
  }

  function saveReflection() {
    const scenarioText = (reflectionScenario || todayScenario || "").trim();
    const createdAt = new Date().toISOString();
    const reflectionEntryBase = {
      id: getRandomId(),
      scenario: scenarioText,
      ...reflection,
      createdAt
    };
    const diaryEntryFromReflectionBase = {
      id: getRandomId(),
      title: scenarioText || "Morning reflection",
      rawText: reflection.reaction || "",
      scenario: scenarioText,
      source: "reflection",
      triggeredSteps: [],
      fact: reflection.facts || "",
      story: reflection.story || "",
      outsideControl: reflection.outsideControl || "",
      insideControl: reflection.insideControl || "",
      chosenResponse: reflection.chosenResponse || "",
      lesson: reflection.intention || reflection.chosenResponse || "",
      moodBefore: null,
      moodAfter: null,
      createdAt
    };
    setAndPersist((prev) => {
      const newDiary = [diaryEntryFromReflectionBase, ...prev.diary];
      const anchor = programProgressAnchorKey(newDiary, prev.startDate);
      const entryDateKey = diaryEntryDateKey(diaryEntryFromReflectionBase);
      const safeAnchor = anchor ?? entryDateKey ?? todayDateKey;
      const dayForEntry = programDayForEntry(safeAnchor, entryDateKey || todayDateKey) ?? 1;
      const todayProgramDay = programDayFromStart(safeAnchor);

      const entry = { ...reflectionEntryBase, day: dayForEntry };
      const diaryEntryFromReflection = { ...diaryEntryFromReflectionBase, day: dayForEntry };
      const pf = progressFieldsFromDiary([diaryEntryFromReflection, ...prev.diary]);

      return {
        ...prev,
        reflections: [entry, ...prev.reflections],
        diary: [diaryEntryFromReflection, ...prev.diary],
        intentions: reflection.intention
          ? [{ id: entry.id, text: reflection.intention, day: dayForEntry }, ...prev.intentions]
          : prev.intentions,
        startDate: pf.startDate,
        lastCompletedDay: Math.max(pf.lastCompletedDay, todayProgramDay),
        streak:
          prev.lastCompletedDay === todayProgramDay - 1 || prev.lastCompletedDay === 0
            ? prev.streak + 1
            : prev.streak
      };
    });
    setReflectionOpen(false);
  }

  function analyzeEvent() {
    async function runAnalysis() {
      try {
        setIsAnalyzing(true);
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryText: eventText })
        });
        if (!response.ok) {
          setAnalysis(detectSteps(eventText));
          return;
        }
        const payload = await response.json();
        const aiAnalysis = payload?.analysis;
        if (!aiAnalysis) {
          setAnalysis(detectSteps(eventText));
          return;
        }
        setAnalysis(aiAnalysis.triggered || detectSteps(eventText));
        setEventForm((prev) => ({
          ...prev,
          fact: aiAnalysis.fact || "",
          story: aiAnalysis.story || "",
          outsideControl: aiAnalysis.outsideControl || "",
          insideControl: aiAnalysis.insideControl || "",
          chosenResponse: aiAnalysis.chosenResponse || "",
          lesson: aiAnalysis.lesson || ""
        }));
      } catch (error) {
        console.error(error);
        setAnalysis(detectSteps(eventText));
      } finally {
        setIsAnalyzing(false);
      }
    }
    void runAnalysis();
  }

  function saveEventEntry() {
    if (!analysis) return;
    const triggeredSteps = [];
    if (analysis.step1) triggeredSteps.push("step1");
    if (analysis.step2) triggeredSteps.push("step2");
    if (analysis.step3) triggeredSteps.push("step3");

    const createdAt = new Date().toISOString();
    const diaryEntryBase = {
      id: getRandomId(),
      loggedDateKey: logEntryDateKey,
      title: eventText.trim() || "Untitled entry",
      rawText: eventText,
      source: "log",
      triggeredSteps,
      ...eventForm,
      moodBefore: normalizeMoodId(eventForm.moodBefore),
      moodAfter: normalizeMoodId(eventForm.moodAfter),
      createdAt
    };
    const anchor = programProgressAnchorKey([diaryEntryBase, ...app.diary], app.startDate) ?? logEntryDateKey;
    const dayForEntry = programDayForEntry(anchor, logEntryDateKey);
    if (dayForEntry == null) {
      window.alert("That date is before your program start. Choose a later date.");
      return;
    }

    const diaryEntry = { ...diaryEntryBase, day: dayForEntry };
    setAndPersist((prev) => {
      const newDiary = [diaryEntry, ...prev.diary];
      const pf = progressFieldsFromDiary(newDiary);
      const todayProgramDay = programDayFromStart(pf.startDate);
      const nextCompleted = Math.max(pf.lastCompletedDay, todayProgramDay);
      return {
        ...prev,
        diary: newDiary,
        startDate: pf.startDate,
        lastCompletedDay: nextCompleted,
        streak: nextCompleted > 0 ? Math.max(prev.streak, 1) : prev.streak
      };
    });
    setEventText("");
    setAnalysis(null);
    // Keep logEntryDateKey so the Diary list below still matches the day just saved (see diaryEntriesForSelectedLogDate).
    setTab("log");
  }

  function closeDiaryEntryModal() {
    setIsDiaryEditModalOpen(false);
    setEditingDiaryId(null);
    setDiaryEntryModalViewOnly(false);
    setDiaryEditMoodPicker(null);
    setOwnerEntryReactions(null);
    setOwnerReactionsLoading(false);
  }

  function openDiaryEditor(entry, viewOnly = false) {
    if (!sharingSettings) void loadSharingSettings();
    setEditingDiaryId(entry.id);
    setEditingDiaryDraft({
      title: diaryTitleDisplay(entry),
      scenario: entry.scenario || "",
      fact: entry.fact || "",
      story: entry.story || "",
      chosenResponse: entry.chosenResponse || "",
      lesson: entry.lesson || "",
      moodBefore: entry.moodBefore != null ? normalizeMoodId(entry.moodBefore) : "reflective",
      moodAfter: entry.moodAfter != null ? normalizeMoodId(entry.moodAfter) : "centered"
    });
    setDiaryEntryModalViewOnly(viewOnly);
    setDiaryEditMoodPicker(null);
    setIsDiaryEditModalOpen(true);
  }

  async function loadSharingSettings() {
    setSharingLoadError(null);
    try {
      const response = await fetch("/api/me/sharing", { cache: "no-store" });
      if (response.status === 503) {
        setSharingLoadError("Sharing requires a database (POSTGRES_URL / DATABASE_URL).");
        setSharingSettings(null);
        return;
      }
      if (!response.ok) {
        setSharingLoadError("Could not load sharing settings.");
        return;
      }
      const data = await response.json();
      setSharingSettings(normalizeSharingApiPayload(data));
    } catch {
      setSharingLoadError("Could not load sharing settings.");
    }
  }

  async function applySharingPatch(body) {
    setSharingBusy(true);
    setSharingLoadError(null);
    try {
      const response = await fetch("/api/me/sharing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (response.status === 503) {
        setSharingLoadError("Sharing requires a database (POSTGRES_URL / DATABASE_URL).");
        return;
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setSharingLoadError(typeof err?.error === "string" ? err.error : "Update failed.");
        return;
      }
      const data = await response.json();
      setSharingSettings(normalizeSharingApiPayload(data));
      setGrantEmailInput("");
      setGrantAdvancedUserIdInput("");
    } catch {
      setSharingLoadError("Update failed.");
    } finally {
      setSharingBusy(false);
    }
  }

  function closeSharedEntryViewer() {
    setSharedEntryViewOpen(false);
    setSharedViewingEntry(null);
    setSharedViewingDraft(null);
    setSharedViewingOmitTitleScenario(false);
    setSharedEntryReactionsDetail(null);
    setSharedCommentDraft("");
  }

  function closeSharedDiaryModal() {
    setSharedDiaryModalOpen(false);
    setSharedDiaryOwnerId("");
    setSharedDiaryOwnerLabel("");
    setSharedDiaryEntries([]);
    setSharedDiaryLoading(false);
    setSharedDiaryError(null);
    setSharedEntryReactionCounts({});
    closeSharedEntryViewer();
  }

  async function refreshSharedReactionCounts(ownerId, entries) {
    if (!ownerId || !Array.isArray(entries) || entries.length === 0) {
      setSharedEntryReactionCounts({});
      return;
    }
    const next = {};
    await Promise.all(
      entries.map(async (e) => {
        if (!e?.id) return;
        try {
          const res = await fetch(
            `/api/shared-diaries/${encodeURIComponent(ownerId)}/entries/${encodeURIComponent(e.id)}/reactions`,
            { cache: "no-store" }
          );
          if (res.ok) {
            const d = await res.json();
            next[e.id] = {
              likeCount: d.likeCount ?? 0,
              commentCount: Array.isArray(d.comments) ? d.comments.length : 0
            };
          }
        } catch {
          /* ignore */
        }
      })
    );
    setSharedEntryReactionCounts(next);
  }

  async function loadSharedDiaryForOwner(ownerId, label) {
    setSharedDiaryOwnerId(ownerId);
    setSharedDiaryOwnerLabel(label);
    setSharedDiaryModalOpen(true);
    setSharedDiaryLoading(true);
    setSharedDiaryError(null);
    setSharedDiaryEntries([]);
    setSharedEntryReactionCounts({});
    closeSharedEntryViewer();
    try {
      const response = await fetch(`/api/shared-diaries/${encodeURIComponent(ownerId)}`, { cache: "no-store" });
      if (response.status === 403) {
        setSharedDiaryError("You do not have access to this diary.");
        return;
      }
      if (response.status === 503) {
        setSharedDiaryError("Sharing requires a database.");
        return;
      }
      if (!response.ok) {
        setSharedDiaryError("Could not load this diary.");
        return;
      }
      const data = await response.json();
      const rawDiary = Array.isArray(data?.diary) ? data.diary : [];
      const normalized = normalizeAppState({ diary: rawDiary }).diary;
      setSharedDiaryEntries(normalized);
      void refreshSharedReactionCounts(ownerId, normalized);
    } catch {
      setSharedDiaryError("Could not load this diary.");
    } finally {
      setSharedDiaryLoading(false);
    }
  }

  useEffect(() => {
    if (!sharedEntryViewOpen || !sharedDiaryOwnerId) {
      return undefined;
    }
    if (!sharedViewingEntry?.id) {
      setSharedReactionsBusy(false);
      setSharedEntryReactionsDetail(null);
      return undefined;
    }
    let cancelled = false;
    async function load() {
      setSharedReactionsBusy(true);
      try {
        const res = await fetch(
          `/api/shared-diaries/${encodeURIComponent(sharedDiaryOwnerId)}/entries/${encodeURIComponent(sharedViewingEntry.id)}/reactions`,
          { cache: "no-store" }
        );
        if (!cancelled) {
          if (res.ok) {
            setSharedEntryReactionsDetail(await res.json());
          } else {
            setSharedEntryReactionsDetail(null);
          }
        }
      } finally {
        if (!cancelled) setSharedReactionsBusy(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sharedEntryViewOpen, sharedViewingEntry?.id, sharedDiaryOwnerId]);

  useEffect(() => {
    if (!isDiaryEditModalOpen || !editingDiaryId) {
      return undefined;
    }
    let cancelled = false;
    setOwnerReactionsLoading(true);
    fetch(`/api/me/sharing/reactions?entryId=${encodeURIComponent(editingDiaryId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setOwnerEntryReactions(data);
      })
      .catch(() => {
        if (!cancelled) setOwnerEntryReactions(null);
      })
      .finally(() => {
        if (!cancelled) setOwnerReactionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDiaryEditModalOpen, editingDiaryId]);

  useEffect(() => {
    if (tab !== "log" && tab !== "progress") {
      setDiaryEntryReactionsSummary({});
      return undefined;
    }
    void loadDiaryEntryReactionsSummary();
  }, [tab, diaryEntryIdsKey, loadDiaryEntryReactionsSummary]);

  useEffect(() => {
    if (diaryEditModalWasOpenRef.current && !isDiaryEditModalOpen && (tab === "log" || tab === "progress")) {
      void loadDiaryEntryReactionsSummary();
    }
    diaryEditModalWasOpenRef.current = isDiaryEditModalOpen;
  }, [isDiaryEditModalOpen, tab, loadDiaryEntryReactionsSummary]);

  async function toggleSharedEntryLike() {
    if (!sharedDiaryOwnerId || !sharedViewingEntry?.id) return;
    setSharedReactionsBusy(true);
    try {
      const res = await fetch(
        `/api/shared-diaries/${encodeURIComponent(sharedDiaryOwnerId)}/entries/${encodeURIComponent(sharedViewingEntry.id)}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggleLike" })
        }
      );
      if (res.ok) {
        const data = await res.json();
        setSharedEntryReactionsDetail(data);
        setSharedEntryReactionCounts((prev) => ({
          ...prev,
          [sharedViewingEntry.id]: {
            likeCount: data.likeCount ?? 0,
            commentCount: Array.isArray(data.comments) ? data.comments.length : 0
          }
        }));
      }
    } finally {
      setSharedReactionsBusy(false);
    }
  }

  async function submitSharedComment() {
    const text = sharedCommentDraft.trim();
    if (!sharedDiaryOwnerId || !sharedViewingEntry?.id || !text) return;
    setSharedReactionsBusy(true);
    try {
      const res = await fetch(
        `/api/shared-diaries/${encodeURIComponent(sharedDiaryOwnerId)}/entries/${encodeURIComponent(sharedViewingEntry.id)}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "comment", body: text })
        }
      );
      if (res.ok) {
        const data = await res.json();
        setSharedEntryReactionsDetail(data);
        setSharedCommentDraft("");
        setSharedEntryReactionCounts((prev) => ({
          ...prev,
          [sharedViewingEntry.id]: {
            likeCount: data.likeCount ?? 0,
            commentCount: Array.isArray(data.comments) ? data.comments.length : 0
          }
        }));
      }
    } finally {
      setSharedReactionsBusy(false);
    }
  }

  async function deleteSharedComment(commentId) {
    if (!sharedDiaryOwnerId || !sharedViewingEntry?.id || !commentId) return;
    setSharedReactionsBusy(true);
    try {
      const res = await fetch(
        `/api/shared-diaries/${encodeURIComponent(sharedDiaryOwnerId)}/entries/${encodeURIComponent(sharedViewingEntry.id)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        const detailRes = await fetch(
          `/api/shared-diaries/${encodeURIComponent(sharedDiaryOwnerId)}/entries/${encodeURIComponent(sharedViewingEntry.id)}/reactions`,
          { cache: "no-store" }
        );
        if (detailRes.ok) {
          const data = await detailRes.json();
          setSharedEntryReactionsDetail(data);
          setSharedEntryReactionCounts((prev) => ({
            ...prev,
            [sharedViewingEntry.id]: {
              likeCount: data.likeCount ?? 0,
              commentCount: Array.isArray(data.comments) ? data.comments.length : 0
            }
          }));
        }
      }
    } finally {
      setSharedReactionsBusy(false);
    }
  }

  async function deleteOwnerComment(commentId) {
    if (!clerkUser?.id || !editingDiaryId || !commentId) return;
    setOwnerReactionsLoading(true);
    try {
      const res = await fetch(
        `/api/shared-diaries/${encodeURIComponent(clerkUser.id)}/entries/${encodeURIComponent(editingDiaryId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        const detailRes = await fetch(
          `/api/me/sharing/reactions?entryId=${encodeURIComponent(editingDiaryId)}`,
          { cache: "no-store" }
        );
        if (detailRes.ok) {
          setOwnerEntryReactions(await detailRes.json());
        }
        void loadDiaryEntryReactionsSummary();
      }
    } finally {
      setOwnerReactionsLoading(false);
    }
  }

  function openSharedEntryViewer(entry) {
    setSharedReactionsBusy(true);
    setSharedEntryReactionsDetail(null);
    setSharedCommentDraft("");
    setSharedViewingEntry(entry);
    setSharedViewingDraft({
      title: diaryTitleDisplay(entry),
      scenario: entry.scenario || "",
      fact: entry.fact || "",
      story: entry.story || "",
      chosenResponse: entry.chosenResponse || "",
      lesson: entry.lesson || "",
      moodBefore: entry.moodBefore != null ? normalizeMoodId(entry.moodBefore) : "reflective",
      moodAfter: entry.moodAfter != null ? normalizeMoodId(entry.moodAfter) : "centered"
    });
    setSharedViewingOmitTitleScenario(isDiaryLogEntry(entry));
    setSharedEntryViewOpen(true);
  }

  function saveDiaryEdit() {
    if (!editingDiaryId) return;
    setAndPersist((prev) => ({
      ...prev,
      diary: prev.diary.map((entry) =>
        entry.id === editingDiaryId
          ? {
              ...entry,
              title: editingDiaryDraft.title,
              scenario: editingDiaryDraft.scenario,
              fact: editingDiaryDraft.fact,
              story: editingDiaryDraft.story,
              chosenResponse: editingDiaryDraft.chosenResponse,
              lesson: editingDiaryDraft.lesson,
              moodBefore: normalizeMoodId(editingDiaryDraft.moodBefore),
              moodAfter: normalizeMoodId(editingDiaryDraft.moodAfter),
              ...(entry.source === "log" ? { rawText: editingDiaryDraft.title } : {})
            }
          : entry
      )
    }));
    closeDiaryEntryModal();
  }

  function deleteDiaryEntry(entryId) {
    const confirmed = window.confirm("Delete this diary entry?");
    if (!confirmed) return;
    setAndPersist((prev) => {
      const deleteIndex = prev.diary.findIndex((entry) => entry.id === entryId);
      const deletedEntry = deleteIndex >= 0 ? prev.diary[deleteIndex] : null;
      if (!deletedEntry) return prev;

      if (deleteUndoTimerRef.current) {
        clearTimeout(deleteUndoTimerRef.current);
      }
      setLastDeletedDiaryEntry({
        entry: deletedEntry,
        index: deleteIndex
      });
      deleteUndoTimerRef.current = setTimeout(() => {
        setLastDeletedDiaryEntry(null);
        deleteUndoTimerRef.current = null;
      }, DELETE_UNDO_TOAST_MS);

      const nextDiary = prev.diary.filter((entry) => entry.id !== entryId);
      const pf = progressFieldsFromDiary(nextDiary);
      const todayBump =
        nextDiary.length === 0 || !pf.startDate ? 0 : programDayFromStart(pf.startDate);
      return {
        ...prev,
        diary: nextDiary,
        startDate: pf.startDate,
        lastCompletedDay: Math.max(pf.lastCompletedDay, todayBump)
      };
    });
    if (editingDiaryId === entryId) {
      closeDiaryEntryModal();
    }
  }

  function undoDeleteDiaryEntry() {
    if (!lastDeletedDiaryEntry) return;
    if (deleteUndoTimerRef.current) {
      clearTimeout(deleteUndoTimerRef.current);
      deleteUndoTimerRef.current = null;
    }
    const { entry, index } = lastDeletedDiaryEntry;
    setAndPersist((prev) => {
      const nextDiary = [...prev.diary];
      const safeIndex = Math.max(0, Math.min(index, nextDiary.length));
      nextDiary.splice(safeIndex, 0, entry);
      const pf = progressFieldsFromDiary(nextDiary);
      const todayBump =
        nextDiary.length === 0 || !pf.startDate ? 0 : programDayFromStart(pf.startDate);
      return {
        ...prev,
        diary: nextDiary,
        startDate: pf.startDate,
        lastCompletedDay: Math.max(pf.lastCompletedDay, todayBump)
      };
    });
    setLastDeletedDiaryEntry(null);
  }

  useEffect(() => {
    return () => {
      if (deleteUndoTimerRef.current) {
        clearTimeout(deleteUndoTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const guardedRefresh = async () => {
      if (cancelled) return;
      await refreshVersionInfo();
    };

    void guardedRefresh();
    const intervalId = setInterval(() => {
      void guardedRefresh();
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  function displayTo24HourTime(value) {
    const raw = String(value || "").trim();
    if (!raw) return "08:00";
    const amPmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!amPmMatch) {
      const nativeTime = raw.match(/^(\d{2}):(\d{2})$/);
      if (!nativeTime) return "08:00";
      return `${nativeTime[1]}:${nativeTime[2]}`;
    }
    let hour = Number(amPmMatch[1]);
    const minute = amPmMatch[2];
    const meridiem = amPmMatch[3].toUpperCase();
    if (meridiem === "AM") {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }

  function toDisplayTime(value) {
    const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) return "8:00 AM";
    let hour = Number(match[1]);
    const minute = match[2];
    const meridiem = hour >= 12 ? "PM" : "AM";
    hour %= 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${meridiem}`;
  }

  function openReminderModal() {
    setReminderDraft(displayTo24HourTime(app.reminderTime));
    setIsReminderModalOpen(true);
  }

  function saveReminderTime() {
    const nextDisplay = toDisplayTime(reminderDraft);
    setAndPersist((prev) => ({ ...prev, reminderTime: nextDisplay }));
    setIsReminderModalOpen(false);
  }

  const moodOptions = [
    { value: "Calm", emoji: "😌" },
    { value: "Centered", emoji: "🙂" },
    { value: "Focused", emoji: "🎯" },
    { value: "Energized", emoji: "⚡" },
    { value: "Reflective", emoji: "🤔" },
    { value: "Resilient", emoji: "🛡️" },
    { value: "Anxious", emoji: "😰" },
    { value: "Overwhelmed", emoji: "😵" },
    { value: "Irritated", emoji: "😤" },
    { value: "Discouraged", emoji: "😞" },
    { value: "Uncertain", emoji: "😕" },
    { value: "Drained", emoji: "🥱" }
  ];

  const normalizedTone = app.tone === "Balanced" ? "Centered" : app.tone;
  const currentMood = moodOptions.find((option) => option.value === normalizedTone) || moodOptions[1];
  const calendarNow = useMemo(() => new Date(), []);
  const calendarYear = calendarNow.getFullYear();
  const calendarMonth = calendarNow.getMonth();
  const calendarMonthLabel = calendarNow.toLocaleDateString([], { month: "long", year: "numeric" });
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstWeekday = new Date(calendarYear, calendarMonth, 1).getDay();
  const progressCalendarTodayKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(
    calendarNow.getDate()
  ).padStart(2, "0")}`;
  const selectedDayLabel = selectedProgressDate
    ? new Date(`${selectedProgressDate}T00:00:00`).toLocaleDateString([], {
        month: "short",
        day: "numeric"
      })
    : null;
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  /** Past (or any non-today) day with diary entries — softer green. */
  const progressCalPastCompletedClass =
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200";
  /** Today with at least one entry — stronger green (stands out from past days). */
  const progressCalTodayWithEntriesClass =
    "border-2 border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-100";
  /** Today with no entries — pink fill, red border/text. */
  const progressCalTodayEmptyClass =
    "border-2 border-red-600 bg-pink-100 text-red-700 dark:border-red-500 dark:bg-pink-950 dark:text-red-200";

  const profileDraftComputedAge = calculateAgeFromBirthday(profileDraft.birthday);

  function toggleFocusPanel() {
    setIsFocusOpen((wasOpen) => {
      if (wasOpen) {
        const root = focusPanelContentRef.current;
        const ae = document.activeElement;
        if (
          root &&
          ae instanceof HTMLElement &&
          root.contains(ae) &&
          (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")
        ) {
          ae.blur();
        }
      }
      return !wasOpen;
    });
  }

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-slate-100 px-4 pb-4 pt-2 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 md:px-8 md:pb-8 md:pt-3">
      <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardContent className="space-y-3 pt-6">
            <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="shrink-0 text-slate-900 dark:text-slate-100">
                    <StoicMarkIcon className="h-[33px] w-[29px]" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle>stoic as phuq</CardTitle>
                    <CardDescription>30-day resilience</CardDescription>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleFocusPanel}
                  aria-expanded={isFocusOpen}
                  aria-label={isFocusOpen ? "Collapse profile and focus settings" : "Expand profile and focus settings"}
                  className={`shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:text-slate-400 dark:hover:bg-slate-700 dark:focus:ring-offset-slate-900 ${
                    isFocusOpen ? "text-emerald-700 dark:text-emerald-400" : ""
                  }`}
                >
                  <FocusSettingsIcon className="h-[19px] w-5" />
                </button>
              </div>
              {isFocusOpen && (
                <div ref={focusPanelContentRef}>
                  <div className="mb-4 rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">About you</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Used to make "What could go wrong today" more specific to your real life.
                    </p>
                    <div className="mt-3 grid gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="profile-birthday">
                          Birthday
                        </label>
                        <div className="flex min-h-[2.75rem] min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <input
                            id="profile-birthday"
                            type="date"
                            value={profileDraft.birthday || ""}
                            onChange={(event) => setProfileDraft((prev) => ({ ...prev, birthday: event.target.value }))}
                            max={toDateKey(new Date())}
                            className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-base text-slate-900 outline-none focus:ring-0 dark:text-slate-100 dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:cursor-pointer dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-90 dark:[&::-moz-calendar-picker-indicator]:cursor-pointer dark:[&::-moz-calendar-picker-indicator]:invert dark:[&::-moz-calendar-picker-indicator]:opacity-90"
                          />
                          <div
                            className="flex w-[4.25rem] shrink-0 flex-col items-center justify-center border-l border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900/90"
                            aria-live="polite"
                            title={
                              profileDraftComputedAge != null
                                ? `Age ${profileDraftComputedAge} (from birthday)`
                                : "Age is calculated from the date on the left"
                            }
                          >
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Age
                            </span>
                            <span className="text-lg font-semibold tabular-nums leading-tight text-slate-900 dark:text-slate-100">
                              {profileDraftComputedAge != null ? profileDraftComputedAge : "—"}
                            </span>
                          </div>
                        </div>
                        {!profileDraft.birthday && String(profileDraft.age || "").trim() ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Legacy saved age until you pick a birthday: {profileDraft.age}
                          </p>
                        ) : null}
                      </div>
                      <Textarea
                        value={profileDraft.maritalStatus}
                        onChange={(event) => setProfileDraft((prev) => ({ ...prev, maritalStatus: event.target.value }))}
                        placeholder="Marital status"
                        className="min-h-[2.75rem]"
                      />
                      <Textarea
                        value={profileDraft.children}
                        onChange={(event) => setProfileDraft((prev) => ({ ...prev, children: event.target.value }))}
                        placeholder="Children (e.g., 2 kids, no children)"
                        className="min-h-[2.75rem]"
                      />
                      <Textarea
                        value={profileDraft.dog}
                        onChange={(event) => setProfileDraft((prev) => ({ ...prev, dog: event.target.value }))}
                        placeholder="Dog or pets"
                        className="min-h-[2.75rem]"
                      />
                      <Textarea
                        value={profileDraft.partner}
                        onChange={(event) => setProfileDraft((prev) => ({ ...prev, partner: event.target.value }))}
                        placeholder="Girlfriend/partner"
                        className="min-h-[2.75rem]"
                      />
                      <Textarea
                        value={profileDraft.job}
                        onChange={(event) => setProfileDraft((prev) => ({ ...prev, job: event.target.value }))}
                        placeholder="Job"
                        className="min-h-[2.75rem]"
                      />
                      <Textarea
                        value={profileDraft.friends}
                        onChange={(event) => setProfileDraft((prev) => ({ ...prev, friends: event.target.value }))}
                        placeholder="Friends/social context"
                        className="min-h-[2.75rem]"
                      />
                      <Textarea
                        value={profileDraft.notes}
                        onChange={(event) => setProfileDraft((prev) => ({ ...prev, notes: event.target.value }))}
                        placeholder="Anything else personal that should shape scenarios"
                        className="min-h-[90px]"
                      />
                    </div>
                    <Button variant="outline" className="mt-3 w-full gap-2" onClick={savePersonalProfile}>
                      {profileSavedFeedback ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : null}
                      {profileSavedFeedback ? "Saved" : "Save profile context"}
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUnshakenVideoOpen(true)}
                    className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-950/25"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/50">
                      <Play className="h-5 w-5 text-emerald-800 dark:text-emerald-300" fill="currentColor" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Unshaken</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Watch the video</p>
                    </div>
                  </button>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Current focus</p>
                  <>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {weekFocus(currentProgramDay)}
                    </p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{weeklySummary}</p>
                    <Button
                      variant="outline"
                      className="mt-4 w-full justify-start gap-2"
                      onClick={() => setIsDarkMode((prev) => !prev)}
                    >
                      {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                      {isDarkMode ? "Light mode" : "Dark mode"}
                    </Button>
                  </>
                </div>
              )}
            </div>
            <div className="min-w-0 pb-1 md:pb-0">
              <div className="flex min-w-0 gap-1 sm:gap-2 md:grid md:gap-2 md:px-0">
                <NavButton active={tab === "home"} icon={Home} label="Home" onClick={() => setTab("home")} />
                <NavButton active={tab === "log"} icon={NotebookPen} label="Log" onClick={() => setTab("log")} />
                <NavButton
                  active={tab === "progress"}
                  icon={LineChart}
                  label="Progress"
                  onClick={() => setTab("progress")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <div className="grid min-w-0 gap-6">
            {tab === "home" && (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <SectionTitle
                      icon={Sparkles}
                      title={`Day ${currentProgramDay} of 30`}
                      subtitle="Train yourself to respond, not react."
                    />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/45 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)] ring-1 ring-emerald-200/40 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/30 dark:ring-emerald-900/30">
                      {reduceMotion ? (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-8 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent"
                        />
                      ) : (
                        <motion.div
                          key={todayScenario}
                          aria-hidden
                          className="pointer-events-none absolute inset-x-8 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent"
                          initial={{ scaleX: 0, opacity: 0 }}
                          animate={{ scaleX: 1, opacity: 1 }}
                          transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
                          style={{ transformOrigin: "center" }}
                        />
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {reduceMotion ? (
                              <span className="flex shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden>
                                <Sparkles className="h-4 w-4" strokeWidth={2} />
                              </span>
                            ) : (
                              <motion.span
                                className="flex shrink-0 text-emerald-600 dark:text-emerald-400"
                                aria-hidden
                                initial={{ opacity: 0, scale: 0.82, rotate: -14 }}
                                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                              >
                                <Sparkles className="h-4 w-4" strokeWidth={2} />
                              </motion.span>
                            )}
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                              What could go wrong today
                            </p>
                          </div>
                          {reduceMotion ? (
                            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.32em] text-emerald-700/85 dark:text-emerald-400/90">
                              Today&apos;s rehearsal
                            </p>
                          ) : (
                            <motion.p
                              className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.32em] text-emerald-700/85 dark:text-emerald-400/90"
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.18, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                            >
                              Today&apos;s rehearsal
                            </motion.p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="outline"
                            className="px-3 py-1.5"
                            onClick={() => void loadDailyScenario()}
                            disabled={isRefreshingScenario}
                            title="Refresh scenario"
                            aria-label="Refresh scenario"
                          >
                            <RefreshCw className={`h-4 w-4 ${isRefreshingScenario ? "animate-spin" : ""}`} />
                          </Button>
                        </div>
                      </div>
                      <motion.div
                        animate={{
                          opacity: isRefreshingScenario ? 0.4 : 1,
                          filter: isRefreshingScenario ? "blur(1.5px)" : "blur(0px)"
                        }}
                        transition={{ duration: 0.35 }}
                      >
                        <DailyScenarioReveal text={todayScenario} reduceMotion={reduceMotion} />
                      </motion.div>
                      {dailyScenarioSource === "ai" && (
                        <div className="pointer-events-none absolute bottom-3 right-3">
                          <AiBadgeIcon />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={startReflection}>
                        Start reflection
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                      <Button variant="outline" onClick={() => setTab("log")}>
                        Log real event
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "log" && (
              <div className="grid gap-6">
                <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                  <Card>
                    <CardHeader>
                      <SectionTitle icon={NotebookPen} title="Log what happened" subtitle="Write it and get guided." />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="log-entry-date">
                          When did this happen?
                        </label>
                        <LogDateControl
                          id="log-entry-date"
                          value={logEntryDateKey}
                          min={dateKeyYearsAgo(5)}
                          max={todayDateKey}
                          onChange={(e) => setLogEntryDateKey(e.target.value || todayDateKey)}
                        />
                        {logEntryDateKey !== todayDateKey && logEntryPreviewDay != null && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Saved as Day {logEntryPreviewDay} of your program · {formatDateKeyDisplay(logEntryDateKey)}
                          </p>
                        )}
                      </div>
                      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-700 dark:bg-emerald-950/40">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                            What happened?
                          </p>
                        </div>
                        <Textarea
                          id="log-event-text"
                          value={eventText}
                          onChange={(e) => setEventText(e.target.value)}
                          placeholder="My friend canceled and now I feel rejected."
                          className="reaction-border-loop min-h-[180px] border-emerald-500 bg-emerald-200/95 text-slate-900 placeholder:text-emerald-900 focus:ring-0 dark:border-emerald-400 dark:bg-emerald-500/25 dark:text-emerald-50 dark:placeholder:text-emerald-200"
                        />
                      </div>
                      <Button onClick={analyzeEvent} disabled={!eventText.trim() || isAnalyzing}>
                        {isAnalyzing ? "Analyzing..." : "Analyze entry"}
                      </Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <SectionTitle
                        icon={Sparkles}
                        title="Trigger result"
                        subtitle="The app picks the right steps—revealed for you."
                      />
                    </CardHeader>
                    <CardContent>
                      {analysis ? (
                        <div key={triggerResultRevealKey} className="space-y-4">
                          <LogTriggerStepsReveal analysis={analysis} reduceMotion={reduceMotion} />
                          <CeremonialInsightBlock
                            label="Facts"
                            text={eventForm.fact}
                            sectionIndex={0}
                            reduceMotion={reduceMotion}
                            revealKey={triggerResultRevealKey}
                          />
                          <CeremonialInsightBlock
                            label="Story"
                            text={eventForm.story}
                            sectionIndex={1}
                            reduceMotion={reduceMotion}
                            revealKey={triggerResultRevealKey}
                          />
                          <CeremonialInsightBlock
                            label="Outside your control"
                            text={eventForm.outsideControl}
                            sectionIndex={2}
                            reduceMotion={reduceMotion}
                            revealKey={triggerResultRevealKey}
                          />
                          <CeremonialInsightBlock
                            label="Inside your control"
                            text={eventForm.insideControl}
                            sectionIndex={3}
                            reduceMotion={reduceMotion}
                            revealKey={triggerResultRevealKey}
                          />
                          <CeremonialInsightBlock
                            label="Chosen response"
                            text={eventForm.chosenResponse}
                            sectionIndex={4}
                            reduceMotion={reduceMotion}
                            revealKey={triggerResultRevealKey}
                          />
                          <CeremonialInsightBlock
                            label="Lesson"
                            text={eventForm.lesson}
                            sectionIndex={5}
                            reduceMotion={reduceMotion}
                            revealKey={triggerResultRevealKey}
                            isLesson
                          />
                          <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-600 dark:bg-slate-800/60">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mood</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              Tap Before or After, then choose in the modal.
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <button
                                type="button"
                                onClick={() => setLogMoodPicker("before")}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                              >
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Before
                                </span>
                                <span className="mt-1 block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {formatMoodValue(eventForm.moodBefore)}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setLogMoodPicker("after")}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                              >
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  After
                                </span>
                                <span className="mt-1 block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {formatMoodValue(eventForm.moodAfter)}
                                </span>
                              </button>
                            </div>
                          </div>
                          <Button className="w-full" onClick={saveEventEntry}>
                            Save to diary
                          </Button>
                        </div>
                      ) : (
                        <p className="rounded-3xl bg-slate-50 p-5 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Analyze an entry to trigger guided prompts.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {diaryEntriesForSelectedLogDate.length > 0 && (
                  <Card>
                    <CardHeader>
                      <SectionTitle icon={BookOpen} title="Diary" subtitle={logTabDiarySubtitle} />
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4">
                        {diaryEntriesForSelectedLogDate.map((entry) => {
                          const entryProgramDay = diaryEntryProgramDayDisplay(programAnchorKey, entry);
                          return (
                            <div key={entry.id} className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                                  {diarySourceLabel(entry)}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => openDiaryEditor(entry, true)}
                                  className="mt-1 w-full whitespace-pre-wrap break-words text-left text-lg font-semibold leading-snug text-slate-900 transition hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-100 dark:hover:text-slate-200 dark:focus-visible:ring-slate-500"
                                >
                                  {diaryTitleDisplay(entry)}
                                </button>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  {entry.loggedDateKey
                                    ? formatDateKeyDisplay(entry.loggedDateKey)
                                    : new Date(entry.createdAt).toLocaleDateString()}
                                  {entryProgramDay != null ? ` · Day ${entryProgramDay}` : ""}
                                </p>
                              </div>
                              {entry.scenario && entry.source !== "reflection" && (
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">
                                  {entry.scenario}
                                </p>
                              )}
                              {entry.moodBefore != null && entry.moodAfter != null && (
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                  Mood: {formatMoodPair(entry.moodBefore, entry.moodAfter)}
                                </p>
                              )}
                              <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{entry.lesson || "No lesson logged."}</p>
                              <DiaryEntrySharedActivityFooter
                                entryId={entry.id}
                                reactionsSummary={diaryEntryReactionsSummary}
                              >
                                <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => openDiaryEditor(entry)}>
                                  Edit
                                </Button>
                                <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => deleteDiaryEntry(entry.id)}>
                                  Delete
                                </Button>
                              </DiaryEntrySharedActivityFooter>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {tab === "progress" && (
              <div className="grid gap-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <SectionTitle icon={LineChart} title="Progress" subtitle="How your patterns are moving." />
                        </div>
                        <Button
                          variant="outline"
                          className="shrink-0 gap-2"
                          type="button"
                          onClick={() => {
                            setIsShareModalOpen(true);
                            void loadSharingSettings();
                          }}
                        >
                          <Share2 className="h-4 w-4 shrink-0" />
                          Share
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                        <span>{lastCompletedEffective}/30 days complete</span>
                        <span>{completionPercent}%</span>
                      </div>
                      <Progress value={completionPercent} />
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                            {calendarMonthLabel}
                          </p>
                          {selectedProgressDate && (
                            <button
                              type="button"
                              onClick={() => setSelectedProgressDate(null)}
                              className="text-xs text-slate-600 underline dark:text-slate-300"
                            >
                              Show all dates
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-7 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
                          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                            <div
                              key={weekday}
                              className="pb-1 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400"
                            >
                              {weekday}
                            </div>
                          ))}
                          {calendarCells.map((dayNumber, index) => {
                            if (!dayNumber) {
                              return <div key={`blank-${index}`} className="min-h-[3.25rem]" aria-hidden />;
                            }
                            const dateKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(
                              dayNumber
                            ).padStart(2, "0")}`;
                            const isSelected = selectedProgressDate === dateKey;
                            const isToday = dateKey === progressCalendarTodayKey;
                            const hasEntries = app.diary.some((entry) => {
                              if (entry.loggedDateKey) return entry.loggedDateKey === dateKey;
                              const entryDate = new Date(entry.createdAt);
                              const entryKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(
                                2,
                                "0"
                              )}-${String(entryDate.getDate()).padStart(2, "0")}`;
                              return entryKey === dateKey;
                            });

                            const dayCellTone =
                              isToday
                                ? hasEntries
                                  ? progressCalTodayWithEntriesClass
                                  : progressCalTodayEmptyClass
                                : isSelected
                                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                  : hasEntries
                                    ? progressCalPastCompletedClass
                                    : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";

                            return (
                              <button
                                key={dateKey}
                                type="button"
                                onClick={() => setSelectedProgressDate(dateKey)}
                                className={`flex min-h-[3.25rem] w-full items-center justify-center rounded-lg border px-1 py-1 text-xs font-medium leading-none transition ${dayCellTone}`}
                                aria-label={
                                  hasEntries
                                    ? `${dateKey}: logged, day ${dayNumber}`
                                    : `${dateKey}: no entry, day ${dayNumber}`
                                }
                              >
                                {hasEntries ? (
                                  <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center">
                                    <span className="tabular-nums text-xs font-semibold leading-none">{dayNumber}</span>
                                    <span
                                      className={`absolute -right-0.5 -top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full shadow-md ring-2 ring-white dark:ring-slate-800 ${
                                        isSelected && !isToday
                                          ? "bg-white text-emerald-700"
                                          : "bg-white text-emerald-600 dark:bg-emerald-50 dark:text-emerald-700"
                                      }`}
                                      aria-hidden
                                    >
                                      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                                    </span>
                                  </span>
                                ) : (
                                  <span className="tabular-nums">{dayNumber}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300">Entries: {diaryStats.total}</p>
                      <p
                        className="text-sm text-slate-700 dark:text-slate-300"
                        title={
                          diaryStats.moodShiftSampleCount > 0
                            ? `Average step change on 1–12 mood scale: ${
                                Number(diaryStats.averageShift) >= 0 ? "+" : ""
                              }${diaryStats.averageShift} (${diaryStats.moodShiftSampleCount} ${
                                diaryStats.moodShiftSampleCount === 1 ? "entry" : "entries"
                              })`
                            : undefined
                        }
                      >
                        Average mood shift: {diaryStats.averageShiftLabel}
                      </p>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              AI pattern read
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                              {app.diary.length === 0
                                ? "No entries yet."
                                : `From your last ${app.diary.length} ${
                                    app.diary.length === 1 ? "entry" : "entries"
                                  }.`}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                            disabled={diaryInsightsLoading || diaryInsightsPayload.length === 0}
                            onClick={() => void fetchDiaryInsights()}
                          >
                            {diaryInsights ? (
                              <>
                                <RefreshCw className={`h-3.5 w-3.5 ${diaryInsightsLoading ? "animate-spin" : ""}`} />
                                Refresh
                              </>
                            ) : (
                              <>
                                <Sparkles className={`h-3.5 w-3.5 ${diaryInsightsLoading ? "animate-spin" : ""}`} />
                                Analyze
                              </>
                            )}
                          </Button>
                        </div>
                        {!diaryInsightsLoading &&
                          !diaryInsightsError &&
                          !diaryInsights &&
                          diaryInsightsPayload.length > 0 && (
                            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                              Tap Analyze to generate a read from your journal. Nothing is sent until you do.
                            </p>
                          )}
                        {!diaryInsightsLoading && diaryInsightsPayload.length === 0 && (
                          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                            Add journal entries to run an analysis.
                          </p>
                        )}
                        {diaryInsightsLoading && (
                          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Taking a pass through what you wrote…</p>
                        )}
                        {diaryInsightsError && (
                          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{diaryInsightsError}</p>
                        )}
                        {diaryInsights && !diaryInsightsLoading && (
                          <DiaryInsightsReveal insights={diaryInsights} reduceMotion={reduceMotion} />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <SectionTitle
                      icon={BookOpen}
                      title="Diary"
                      subtitle={
                        selectedProgressDate
                          ? `Showing entries for ${selectedDayLabel}`
                          : "Your logged events in one place."
                      }
                    />
                  </CardHeader>
                  <CardContent>
                    {progressDiaryEntries.length === 0 ? (
                      <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {selectedProgressDate
                          ? `No diary entries yet for ${selectedDayLabel}.`
                          : "No diary entries yet."}
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {progressDiaryEntries.map((entry) => {
                          const entryProgramDay = diaryEntryProgramDayDisplay(programAnchorKey, entry);
                          return (
                          <div key={entry.id} className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                                {diarySourceLabel(entry)}
                              </p>
                              <button
                                type="button"
                                onClick={() => openDiaryEditor(entry, true)}
                                className="mt-1 w-full whitespace-pre-wrap break-words text-left text-lg font-semibold leading-snug text-slate-900 transition hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-100 dark:hover:text-slate-200 dark:focus-visible:ring-slate-500"
                              >
                                {diaryTitleDisplay(entry)}
                              </button>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {entry.loggedDateKey
                                  ? formatDateKeyDisplay(entry.loggedDateKey)
                                  : new Date(entry.createdAt).toLocaleDateString()}
                                {entryProgramDay != null ? ` · Day ${entryProgramDay}` : ""}
                              </p>
                            </div>
                            {entry.scenario && entry.source !== "reflection" && (
                              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">
                                {entry.scenario}
                              </p>
                            )}
                            {entry.moodBefore != null && entry.moodAfter != null && (
                              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                Mood: {formatMoodPair(entry.moodBefore, entry.moodAfter)}
                              </p>
                            )}
                            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{entry.lesson || "No lesson logged."}</p>
                            <DiaryEntrySharedActivityFooter
                              entryId={entry.id}
                              reactionsSummary={diaryEntryReactionsSummary}
                            >
                              <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => openDiaryEditor(entry)}>
                                Edit
                              </Button>
                              <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => deleteDiaryEntry(entry.id)}>
                                Delete
                              </Button>
                            </DiaryEntrySharedActivityFooter>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {unshakenVideoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Unshaken video"
          onClick={(e) => {
            if (e.target === e.currentTarget) setUnshakenVideoOpen(false);
          }}
        >
          <div className="relative w-full max-w-4xl">
            <button
              type="button"
              onClick={() => setUnshakenVideoOpen(false)}
              className="absolute right-2 top-2 z-10 rounded-xl bg-black/55 p-2 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              aria-label="Close video"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
            <video
              ref={unshakenVideoRef}
              className="max-h-[85vh] w-full rounded-2xl bg-black shadow-2xl ring-1 ring-white/10"
              controls
              playsInline
              preload="metadata"
              src="/videos/unshaken.mp4"
            />
          </div>
        </div>
      )}

      {reflectionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="max-h-[92vh] w-full max-w-3xl overflow-auto">
            <CardHeader className="relative pr-14">
              <ModalCloseButton onClick={() => setReflectionOpen(false)} />
              <SectionTitle icon={Brain} title="Morning reflection" subtitle="Practice before the moment happens." />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-3xl p-1">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  What could go wrong today
                </p>
                <Textarea
                  value={reflectionScenario}
                  onChange={(e) => setReflectionScenario(e.target.value)}
                  className="mt-2 min-h-[84px] rounded-2xl border-emerald-300 bg-emerald-50 font-semibold leading-snug text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-700 dark:bg-emerald-950/40">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                    What reaction usually comes first?
                  </p>
                </div>
                <Textarea
                  value={reflection.reaction}
                  onChange={(e) => setReflection((prev) => ({ ...prev, reaction: e.target.value }))}
                  placeholder="Type your first reaction..."
                  className="reaction-border-loop border-emerald-500 bg-emerald-200/95 text-slate-900 placeholder:text-emerald-900 focus:ring-0 dark:border-emerald-400 dark:bg-emerald-500/25 dark:text-emerald-50 dark:placeholder:text-emerald-200"
                />
                {reflection.reaction.trim() && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => prefillReflectionFromReaction(reflection.reaction)}
                      disabled={isPrefillingReflection}
                    >
                      {isPrefillingReflection ? "Generating..." : "Done"}
                    </Button>
                  </div>
                )}
              </div>
              {isPrefillingReflection && (
                <p className="text-xs text-slate-500 dark:text-slate-400">AI is prefilling the rest...</p>
              )}
              <Textarea
                value={reflection.facts}
                onChange={(e) => setReflection((prev) => ({ ...prev, facts: e.target.value }))}
                placeholder="Facts"
              />
              <Textarea
                value={reflection.story}
                onChange={(e) => setReflection((prev) => ({ ...prev, story: e.target.value }))}
                placeholder="Story"
              />
              <Textarea
                value={reflection.outsideControl}
                onChange={(e) => setReflection((prev) => ({ ...prev, outsideControl: e.target.value }))}
                placeholder="Outside your control"
              />
              <Textarea
                value={reflection.insideControl}
                onChange={(e) => setReflection((prev) => ({ ...prev, insideControl: e.target.value }))}
                placeholder="Inside your control"
              />
              <Textarea
                value={reflection.chosenResponse}
                onChange={(e) => setReflection((prev) => ({ ...prev, chosenResponse: e.target.value }))}
                placeholder="Chosen response"
              />
              <Textarea
                value={reflection.intention}
                onChange={(e) => setReflection((prev) => ({ ...prev, intention: e.target.value }))}
                placeholder="Daily intention"
              />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setReflectionOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveReflection}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Save reflection
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mx-auto mt-8 w-full min-w-0 max-w-7xl rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:px-5">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Shared diaries</p>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">View someone else&apos;s diary</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Choose someone who has already shared with you. Sign in with the account they allowed.
        </p>
        <div className="mt-3 space-y-1">
          <label htmlFor="shared-diary-select" className="sr-only">
            View someone else&apos;s diary
          </label>
          <div className="relative">
            <select
              id="shared-diary-select"
              className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-11 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
              defaultValue=""
              disabled={sharedDiariesUnavailable || sharedDiariesItems.length === 0}
              onChange={(e) => {
                const v = e.target.value;
                const el = e.target;
                if (!v) return;
                const item = sharedDiariesItems.find((i) => i.ownerId === v);
                void loadSharedDiaryForOwner(v, item?.label || v);
                requestAnimationFrame(() => {
                  el.value = "";
                });
              }}
            >
            <option value="">
              {sharedDiariesUnavailable
                ? "Sharing needs a database"
                : sharedDiariesItems.length === 0
                  ? "No one has shared with you yet"
                  : "Choose someone…"}
            </option>
            {sharedDiariesItems.map((item) => (
              <option key={item.ownerId} value={item.ownerId}>
                {item.label}
              </option>
            ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400"
              aria-hidden
            />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 flex w-full min-w-0 max-w-7xl flex-wrap items-center justify-between gap-2 gap-y-3 rounded-3xl bg-white px-4 py-4 text-sm text-slate-500 shadow-sm dark:border dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:px-5">
        <button
          type="button"
          onClick={openReminderModal}
          className="flex min-w-0 max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Calendar className="h-4 w-4" />
          <span>Reminder {app.reminderTime}</span>
        </button>
        {isClient && "Notification" in window ? (
          <button
            type="button"
            onClick={isPushEnabled ? disablePushNotifications : enablePushNotifications}
            className="flex min-w-0 max-w-full shrink items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Bell className="h-4 w-4" />
            <span>
              {isPushEnabled
                ? "Push on"
                : notificationPermission === "denied"
                  ? "Push blocked"
                  : "Enable push"}
            </span>
          </button>
        ) : (
          <span className="min-w-0 shrink text-xs text-slate-400 dark:text-slate-500">Browser notifications unavailable</span>
        )}
        {saving ? (
          <span className="shrink-0">Saving...</span>
        ) : (
          <button
            type="button"
            onClick={() => setIsMoodModalOpen(true)}
            className="min-w-0 shrink rounded-lg px-2 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Mood: {currentMood.value} {currentMood.emoji}
          </button>
        )}
      </div>
      <div className="mx-auto mt-2 max-w-7xl text-center text-xs text-slate-400 dark:text-slate-500">
        <div>for Sean</div>
        {latestCommit ? (
          latestCommitUrl ? (
            <a
              href={latestCommitUrl}
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-slate-500 dark:hover:text-slate-400"
            >
              Build commit: {latestCommit}
            </a>
          ) : (
            <span>Build commit: {latestCommit}</span>
          )
        ) : (
          <span>Build commit: --</span>
        )}
      </div>

      {isReminderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="relative pr-14">
              <ModalCloseButton onClick={() => setIsReminderModalOpen(false)} />
              <CardTitle>Edit reminder time</CardTitle>
              <CardDescription>Choose when you want to be reminded daily.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="time"
                value={reminderDraft}
                onChange={(e) => setReminderDraft(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsReminderModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveReminderTime}>Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {logMoodPicker && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setLogMoodPicker(null)}
          role="presentation"
        >
          <Card
            className="max-h-[90vh] w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="relative pr-14">
              <ModalCloseButton onClick={() => setLogMoodPicker(null)} />
              <CardTitle>Choose current mood</CardTitle>
              <CardDescription>
                {logMoodPicker === "before"
                  ? "Before — how you felt when it happened. This tunes your state label for this entry."
                  : "After — how you feel after working through this."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <MoodOptionList
                value={logMoodPicker === "before" ? eventForm.moodBefore : eventForm.moodAfter}
                onSelect={(id) => {
                  setEventForm((prev) =>
                    logMoodPicker === "before"
                      ? { ...prev, moodBefore: id }
                      : { ...prev, moodAfter: id }
                  );
                  setLogMoodPicker(null);
                }}
              />
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setLogMoodPicker(null)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {diaryEditMoodPicker && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setDiaryEditMoodPicker(null)}
          role="presentation"
        >
          <Card
            className="max-h-[90vh] w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="relative pr-14">
              <ModalCloseButton onClick={() => setDiaryEditMoodPicker(null)} />
              <CardTitle>Choose current mood</CardTitle>
              <CardDescription>
                {diaryEditMoodPicker === "before"
                  ? "Before — how you felt when it happened. This tunes your state label for this entry."
                  : "After — how you feel after working through this."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <MoodOptionList
                value={
                  diaryEditMoodPicker === "before"
                    ? editingDiaryDraft.moodBefore
                    : editingDiaryDraft.moodAfter
                }
                onSelect={(id) => {
                  setEditingDiaryDraft((prev) =>
                    diaryEditMoodPicker === "before"
                      ? { ...prev, moodBefore: id }
                      : { ...prev, moodAfter: id }
                  );
                  setDiaryEditMoodPicker(null);
                }}
              />
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setDiaryEditMoodPicker(null)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isMoodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="relative pr-14">
              <ModalCloseButton onClick={() => setIsMoodModalOpen(false)} />
              <CardTitle>Choose current mood</CardTitle>
              <CardDescription>This tunes your state label for today.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {moodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition ${
                    app.tone === option.value
                      ? "border-slate-900 bg-slate-100 text-slate-900 dark:border-slate-200 dark:bg-slate-700 dark:text-slate-100"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
                  onClick={() => {
                    setAndPersist((prev) => ({ ...prev, tone: option.value }));
                    setIsMoodModalOpen(false);
                  }}
                >
                  <span>{option.value}</span>
                  <span>{option.emoji}</span>
                </button>
              ))}
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setIsMoodModalOpen(false)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isDiaryEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="max-h-[92vh] w-full max-w-2xl overflow-auto">
            <CardHeader className="relative pr-14">
              <ModalCloseButton onClick={closeDiaryEntryModal} />
              <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span>{diaryEntryModalViewOnly ? "Diary entry" : "Edit diary entry"}</span>
                {editingDiaryEntryDateLabel ? (
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                    {editingDiaryEntryDateLabel}
                  </span>
                ) : null}
              </CardTitle>
              {!diaryEntryModalViewOnly && (
                <CardDescription>Update or remove this entry.</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <DiaryEntryModalFields
                viewOnly={diaryEntryModalViewOnly}
                draft={editingDiaryDraft}
                omitTitleAndScenario={omitTitleScenarioInDiaryModal}
                onFieldChange={(key, value) =>
                  setEditingDiaryDraft((prev) => ({ ...prev, [key]: value }))
                }
              />
              {diaryEntryModalViewOnly && editingDiaryEntryMoodPair != null && (
                <section
                  className="mt-4"
                  aria-label={formatMoodPair(editingDiaryEntryMoodPair.before, editingDiaryEntryMoodPair.after)}
                >
                  <p className={diaryModalFieldLabelClass}>Mood</p>
                  <p className="mt-1.5 text-left text-base font-medium leading-snug text-slate-800 dark:text-slate-200">
                    {formatMoodLabelEmojiPairLine(
                      editingDiaryEntryMoodPair.before,
                      editingDiaryEntryMoodPair.after
                    )}
                  </p>
                </section>
              )}
              {!diaryEntryModalViewOnly && (
                <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-600 dark:bg-slate-800/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mood</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Tap Before or After, then choose in the modal.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDiaryEditMoodPicker("before")}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Before
                      </span>
                      <span className="mt-1 block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatMoodValue(editingDiaryDraft.moodBefore)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiaryEditMoodPicker("after")}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        After
                      </span>
                      <span className="mt-1 block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatMoodValue(editingDiaryDraft.moodAfter)}
                      </span>
                    </button>
                  </div>
                </div>
              )}
              {(ownerReactionsLoading ||
                (ownerEntryReactions &&
                  (sharingSettings?.enabled ||
                    (ownerEntryReactions.likeCount ?? 0) > 0 ||
                    (ownerEntryReactions.comments?.length ?? 0) > 0))) && (
                <section className="mt-4 rounded-3xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-600 dark:bg-slate-800/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    From people you&apos;ve shared with
                  </p>
                  {ownerReactionsLoading ? (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
                  ) : ownerEntryReactions ? (
                    <div className="mt-2 space-y-3">
                      {(ownerEntryReactions.likeCount ?? 0) > 0 ? (
                        <div className="flex flex-wrap items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <Heart className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
                          <div>
                            <span className="font-medium">
                              {ownerEntryReactions.likeCount} like
                              {ownerEntryReactions.likeCount === 1 ? "" : "s"}
                            </span>
                            {Array.isArray(ownerEntryReactions.likes) && ownerEntryReactions.likes.length > 0 ? (
                              <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                                {ownerEntryReactions.likes.map((l) => l.label).join(", ")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {Array.isArray(ownerEntryReactions.comments) && ownerEntryReactions.comments.length > 0 ? (
                        <ul className="space-y-2">
                          {ownerEntryReactions.comments.map((c) => (
                            <li
                              key={c.id}
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-slate-900 dark:text-slate-100">{c.authorLabel}</p>
                                  <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                                    {c.body}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {c.createdAt
                                      ? new Date(c.createdAt).toLocaleString(undefined, {
                                          dateStyle: "medium",
                                          timeStyle: "short"
                                        })
                                      : ""}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="shrink-0 px-2 py-1"
                                  title="Remove comment"
                                  onClick={() => void deleteOwnerComment(c.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {sharingSettings?.enabled &&
                      (ownerEntryReactions.likeCount ?? 0) === 0 &&
                      (!ownerEntryReactions.comments || ownerEntryReactions.comments.length === 0) ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No likes or comments yet.</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Could not load activity.</p>
                  )}
                </section>
              )}
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-600">
                {diaryEntryModalViewOnly ? (
                  <div className="flex justify-end">
                    <Button variant="outline" onClick={closeDiaryEntryModal}>
                      Close
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={closeDiaryEntryModal}>
                      Cancel
                    </Button>
                    <Button onClick={saveDiaryEdit}>Save changes</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="max-h-[92vh] w-full max-w-md overflow-auto">
            <CardHeader className="relative pr-14">
              <ModalCloseButton onClick={() => setIsShareModalOpen(false)} />
              <CardTitle>Share</CardTitle>
              <CardDescription>
                Allow specific people to view your diary entries only (not profile or other app data). Turn on sharing
                below, set your visible name, then share a link or QR code or add people by email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sharingLoadError ? (
                <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
                  {sharingLoadError}
                </p>
              ) : null}
              {sharingSettings ? (
                <>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-500"
                      checked={sharingSettings.enabled}
                      disabled={sharingBusy}
                      onChange={(e) => void applySharingPatch({ enabled: e.target.checked })}
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Let allowlisted people read my diary
                    </span>
                  </label>
                  {sharingSettings.enabled ? (
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-600 dark:bg-slate-800/60">
                      <label htmlFor="share-display-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Name others see when you share
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        This is how you show up in their &quot;View someone else&apos;s diary&quot; list. Leave blank to use
                        your account name from Clerk.
                      </p>
                      <input
                        id="share-display-name"
                        type="text"
                        value={shareDisplayNameDraft}
                        onChange={(e) => setShareDisplayNameDraft(e.target.value)}
                        onBlur={() => {
                          const next = shareDisplayNameDraft.trim();
                          const prev = (sharingSettings.shareDisplayName || "").trim();
                          if (next === prev) return;
                          void applySharingPatch({ shareDisplayName: next });
                        }}
                        maxLength={80}
                        placeholder="e.g. Alex"
                        disabled={sharingBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  ) : null}
                  {sharingSettings.enabled ? (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-600 dark:bg-slate-800/60">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Invite link &amp; QR code</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Anyone signed in to this app can open the link or scan the QR to add themselves to your
                        allowlist (same as you approving them).
                      </p>
                      {sharingSettings.inviteUrl ? (
                        <>
                          <div className="flex justify-center rounded-2xl bg-white p-3 dark:bg-slate-100">
                            <QRCode value={sharingSettings.inviteUrl} size={168} level="M" />
                          </div>
                          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                              type="text"
                              readOnly
                              value={sharingSettings.inviteUrl}
                              className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                            />
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="gap-1.5 text-xs"
                                disabled={sharingBusy}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(sharingSettings.inviteUrl);
                                    setInviteLinkCopied(true);
                                    window.setTimeout(() => setInviteLinkCopied(false), 2000);
                                  } catch {
                                    /* ignore */
                                  }
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {inviteLinkCopied ? "Copied" : "Copy link"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="text-xs"
                                disabled={sharingBusy}
                                onClick={() => void applySharingPatch({ rotateInviteToken: true })}
                              >
                                New link
                              </Button>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            &quot;New link&quot; invalidates the previous QR and URL if you need to revoke old invites.
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-amber-800 dark:text-amber-200/90">
                          Set <span className="font-mono">NEXT_PUBLIC_APP_URL</span> to your site URL (e.g. in Vercel
                          env or <span className="font-mono">.env.local</span>) so invite links and QR codes can be
                          generated.
                        </p>
                      )}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Grant access by email</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Choose from registered accounts below or type an exact email. They must already use this app with
                      that email.
                    </p>
                    {sharingRegisteredUsersLoading ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Loading registered accounts…</p>
                    ) : sharingRegisteredUsersError ? (
                      <p className="rounded-xl bg-rose-50 px-2 py-1.5 text-xs text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
                        {sharingRegisteredUsersError}
                      </p>
                    ) : sharingGrantPickerRows.length > 0 ? (
                      <ul className="max-h-40 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-600 dark:bg-slate-900/80">
                        {sharingGrantPickerRows.map((u) => (
                          <li
                            key={u.userId}
                            className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{u.label}</p>
                              <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">{u.email}</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="shrink-0 px-2 py-1 text-xs"
                              disabled={sharingBusy}
                              onClick={() => void applySharingPatch({ grantUserId: u.userId })}
                            >
                              Add
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : sharingRegisteredUsers.length > 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Everyone in the directory is already on your list—revoke someone to add them again from here, or
                        use the email field.
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        No other registered accounts with an email were returned (small deployments only; capped for
                        performance).
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="email"
                        autoComplete="email"
                        list="grant-email-suggestions"
                        value={grantEmailInput}
                        onChange={(e) => setGrantEmailInput(e.target.value)}
                        placeholder="friend@example.com"
                        className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                      />
                      <datalist id="grant-email-suggestions">
                        {sharingGrantPickerRows.map((u) => (
                          <option key={u.userId} value={u.email}>
                            {u.label}
                          </option>
                        ))}
                      </datalist>
                      <Button
                        type="button"
                        disabled={
                          sharingBusy || (!grantEmailInput.trim() && !grantAdvancedUserIdInput.trim())
                        }
                        onClick={() => {
                          const adv = grantAdvancedUserIdInput.trim();
                          if (adv) {
                            void applySharingPatch({ grantUserId: adv });
                          } else {
                            void applySharingPatch({ grantEmail: grantEmailInput.trim() });
                          }
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    <details className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs dark:border-slate-600 dark:bg-slate-800/60">
                      <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-400">
                        Advanced: Clerk user id
                      </summary>
                      <p className="mt-2 text-slate-500 dark:text-slate-400">
                        Rarely needed—e.g. if email lookup fails. Ask them to copy it from Clerk Dashboard → Users →
                        their account, or from their session if you expose it.
                      </p>
                      <input
                        type="text"
                        value={grantAdvancedUserIdInput}
                        onChange={(e) => setGrantAdvancedUserIdInput(e.target.value)}
                        placeholder="user_..."
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                      />
                    </details>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Can view your diary</p>
                    {sharingSettings.grants.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Nobody yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {sharingSettings.grants.map((g) => (
                          <li
                            key={g.userId}
                            className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900 dark:text-slate-100">{g.label}</p>
                              <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title={g.userId}>
                                {g.userId}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              className="shrink-0 px-2 py-1 text-xs"
                              type="button"
                              disabled={sharingBusy}
                              onClick={() => void applySharingPatch({ revokeUserId: g.userId })}
                            >
                              Revoke
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : !sharingLoadError ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
              ) : null}
              <div className="flex justify-end pt-2">
                <Button variant="outline" type="button" onClick={() => setIsShareModalOpen(false)}>
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {sharedDiaryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="max-h-[92vh] w-full max-w-2xl overflow-auto">
            <CardHeader className="relative pr-14">
              <ModalCloseButton onClick={closeSharedDiaryModal} />
              <SectionTitle
                icon={Sparkles}
                title={sharedDiaryOwnerLabel ? `${sharedDiaryOwnerLabel}'s diary` : "Shared diary"}
                subtitle="Read-only · open an entry to see the full ceremony · like and comment below"
              />
            </CardHeader>
            <CardContent>
              {sharedDiaryLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
              ) : null}
              {sharedDiaryError ? (
                <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
                  {sharedDiaryError}
                </p>
              ) : null}
              {!sharedDiaryLoading && !sharedDiaryError && sharedDiarySorted.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No entries yet.</p>
              ) : null}
              {!sharedDiaryLoading && !sharedDiaryError && sharedDiarySorted.length > 0 ? (
                <div key={sharedDiaryOwnerId || "shared"} className="grid gap-4">
                  {sharedDiarySorted.map((entry, index) => {
                    const entryProgramDay = diaryEntryProgramDayDisplay(sharedDiaryAnchorKey, entry);
                    const rc = entry.id ? sharedEntryReactionCounts[entry.id] : null;
                    return (
                      <SharedDiaryListEntryCard
                        key={entry.id || diaryTitleDisplay(entry)}
                        entry={entry}
                        index={index}
                        entryProgramDay={entryProgramDay}
                        rc={rc}
                        onOpen={() => openSharedEntryViewer(entry)}
                      />
                    );
                  })}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {sharedEntryViewOpen && sharedViewingDraft ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="max-h-[92vh] w-full max-w-2xl overflow-auto">
            <CardHeader className="relative pr-14">
              <ModalCloseButton onClick={closeSharedEntryViewer} />
              <SectionTitle
                icon={Sparkles}
                title="Diary entry"
                subtitle={
                  sharedViewingDateLabel
                    ? `${sharedViewingDateLabel} · Read-only · full ceremony · like and comment below`
                    : "Read-only · full ceremony · like and comment below"
                }
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <DiaryEntryModalFields
                viewOnly
                draft={sharedViewingDraft}
                omitTitleAndScenario={sharedViewingOmitTitleScenario}
                onFieldChange={() => {}}
              />
              {sharedViewingMoodPair != null ? (
                <section
                  className="mt-4"
                  aria-label={formatMoodPair(sharedViewingMoodPair.before, sharedViewingMoodPair.after)}
                >
                  <p className={diaryModalFieldLabelClass}>Mood</p>
                  <p className="mt-1.5 text-left text-base font-medium leading-snug text-slate-800 dark:text-slate-200">
                    {formatMoodLabelEmojiPairLine(sharedViewingMoodPair.before, sharedViewingMoodPair.after)}
                  </p>
                </section>
              ) : null}
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-600 dark:bg-slate-800/60">
                <p className={diaryModalFieldLabelClass}>Reactions</p>
                {sharedReactionsBusy && !sharedEntryReactionsDetail ? (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
                ) : null}
                {sharedEntryReactionsDetail ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5 px-3 py-1.5 text-sm"
                        disabled={sharedReactionsBusy}
                        onClick={() => void toggleSharedEntryLike()}
                        aria-pressed={sharedEntryReactionsDetail.likedByMe}
                      >
                        <Heart
                          className={`h-4 w-4 ${sharedEntryReactionsDetail.likedByMe ? "fill-rose-500 text-rose-500" : ""}`}
                          aria-hidden
                        />
                        {sharedEntryReactionsDetail.likeCount ?? 0}
                      </Button>
                    </div>
                    {Array.isArray(sharedEntryReactionsDetail.comments) && sharedEntryReactionsDetail.comments.length > 0 ? (
                      <ul className="space-y-2">
                        {sharedEntryReactionsDetail.comments.map((c) => (
                          <li
                            key={c.id}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-900 dark:text-slate-100">{c.authorLabel}</p>
                                <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{c.body}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {c.createdAt
                                    ? new Date(c.createdAt).toLocaleString(undefined, {
                                        dateStyle: "medium",
                                        timeStyle: "short"
                                      })
                                    : ""}
                                </p>
                              </div>
                              {clerkUser?.id && c.authorUserId === clerkUser.id ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="shrink-0 px-2 py-1 text-xs"
                                  title="Delete your comment"
                                  disabled={sharedReactionsBusy}
                                  onClick={() => void deleteSharedComment(c.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400">No comments yet.</p>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <textarea
                        value={sharedCommentDraft}
                        onChange={(e) => setSharedCommentDraft(e.target.value)}
                        placeholder="Add a comment…"
                        rows={2}
                        maxLength={2000}
                        className="min-h-[72px] w-full flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <Button
                        type="button"
                        disabled={sharedReactionsBusy || !sharedCommentDraft.trim()}
                        onClick={() => void submitSharedComment()}
                      >
                        Post
                      </Button>
                    </div>
                  </div>
                ) : !sharedReactionsBusy ? (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Could not load reactions.</p>
                ) : null}
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-600">
                <div className="flex justify-end">
                  <Button variant="outline" type="button" onClick={closeSharedEntryViewer}>
                    Close
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {lastDeletedDiaryEntry && (
        <div className="fixed bottom-4 left-1/2 z-[60] w-[min(92vw,520px)] -translate-x-1/2 overflow-hidden rounded-2xl border-2 border-[#f472b6] bg-[#fbcfe8] shadow-lg dark:border-[#be123c] dark:bg-[#881337]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm text-rose-950 dark:text-rose-50">Diary entry deleted.</p>
            <Button
              variant="outline"
              className="!border-red-600 !bg-white px-3 py-1 text-xs font-medium !text-red-700 hover:!bg-red-50 dark:!border-red-400 dark:!bg-red-950 dark:!text-red-100 dark:hover:!bg-red-900"
              onClick={undoDeleteDiaryEntry}
            >
              Undo
            </Button>
          </div>
          <div className="h-1 w-full bg-rose-400/35 dark:bg-rose-950/80" aria-hidden="true">
            <div
              key={lastDeletedDiaryEntry.entry.id}
              className="h-full w-full origin-left bg-rose-700 dark:bg-rose-200"
              style={{
                animation: `deleteUndoProgress ${DELETE_UNDO_TOAST_MS}ms linear forwards`
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
