"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Bell,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Home,
  LineChart,
  Moon,
  NotebookPen,
  RefreshCw,
  Sun,
  Shield,
  Sparkles
} from "lucide-react";

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

const DEFAULT_STATE = {
  day: 1,
  startDate: null,
  reminderTime: "8:00 AM",
  tone: "Balanced",
  personalProfile: {
    age: "",
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
  lastCompletedDay: 0,
  streak: 0
};

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

function profileToScenarioContext(profile) {
  if (!profile || typeof profile !== "object") return "";
  const entries = [
    ["Age", profile.age],
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

function getRandomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function Card({ className = "", children }) {
  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}
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
function Button({ className = "", variant = "default", children, ...props }) {
  const base = "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm transition";
  const style =
    variant === "outline"
      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200";
  return (
    <button className={`${base} ${style} ${className}`} {...props}>
      {children}
    </button>
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
        className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${className}`}
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
        className={`w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${className}`}
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

function AiBadgeIcon() {
  return (
    <svg
      width="22"
      height="21"
      viewBox="0 0 26 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-slate-900 dark:text-white"
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

export default function ResilienceApp() {
  const [app, setApp] = useState(DEFAULT_STATE);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("home");
  const [isFocusOpen, setIsFocusOpen] = useState(true);
  const [dailyScenario, setDailyScenario] = useState("");
  const [dailyScenarioSource, setDailyScenarioSource] = useState("fallback");
  const [dailyScenarioCategory, setDailyScenarioCategory] = useState("");
  const [isRefreshingScenario, setIsRefreshingScenario] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isMoodModalOpen, setIsMoodModalOpen] = useState(false);
  const [reminderDraft, setReminderDraft] = useState("08:00");
  const [isPrefillingReflection, setIsPrefillingReflection] = useState(false);
  const [selectedProgressDate, setSelectedProgressDate] = useState(null);
  const [isDiaryEditModalOpen, setIsDiaryEditModalOpen] = useState(false);
  const [editingDiaryId, setEditingDiaryId] = useState(null);
  const [editingDiaryDraft, setEditingDiaryDraft] = useState({
    title: "",
    scenario: "",
    fact: "",
    story: "",
    chosenResponse: "",
    lesson: ""
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
    moodBefore: 4,
    moodAfter: 6
  });

  function savePersonalProfile() {
    const nextProfile = {
      age: String(profileDraft.age || "").trim(),
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
    void loadDailyScenario(nextProfile);
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
          new Notification("Unshaken reminder", {
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
    async function loadState() {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        setApp({ ...DEFAULT_STATE, ...(payload.state || {}) });
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    void loadState();
  }, []);

  const currentDateKey = useMemo(() => toDateKey(new Date()), []);
  const currentProgramDay = useMemo(() => programDayFromStart(app.startDate), [app.startDate]);

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
        setDailyScenario(payload.scenario);
        setDailyScenarioSource(payload.source || "fallback");
        setDailyScenarioCategory(payload.category || "");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsRefreshingScenario(false);
    }
  }

  useEffect(() => {
    if (!loading) {
      void loadDailyScenario();
    }
  }, [currentProgramDay, loading]);

  const todayScenario = useMemo(
    () => dailyScenario || scenarioForDay(currentProgramDay),
    [currentProgramDay, dailyScenario]
  );
  const completionPercent = useMemo(() => Math.round((app.lastCompletedDay / 30) * 100), [app.lastCompletedDay]);
  const diaryStats = useMemo(() => {
    const total = app.diary.length;
    const stepCounts = app.diary.reduce(
      (acc, entry) => {
        entry.triggeredSteps.forEach((step) => {
          acc[step] += 1;
        });
        return acc;
      },
      { step1: 0, step2: 0, step3: 0 }
    );
    const topStep = Object.entries(stepCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "step1";
    const averageShift =
      total === 0
        ? 0
        : (
            app.diary.reduce((sum, entry) => sum + (Number(entry.moodAfter) - Number(entry.moodBefore)), 0) /
            total
          ).toFixed(1);
    const storyCounts = {};
    app.diary.forEach((entry) => {
      const key = entry.story?.trim();
      if (key) storyCounts[key] = (storyCounts[key] || 0) + 1;
    });
    const topStory = Object.entries(storyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "No dominant story yet.";
    return { total, topStep, averageShift, topStory };
  }, [app.diary]);

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
    const entry = {
      id: getRandomId(),
      day: currentProgramDay,
      scenario: scenarioText,
      ...reflection,
      createdAt: new Date().toISOString()
    };
    const diaryEntryFromReflection = {
      id: getRandomId(),
      day: currentProgramDay,
      title: `Morning reflection: ${scenarioText.slice(0, 45)}`,
      rawText: reflection.reaction || "",
      scenario: scenarioText,
      source: "morning_reflection",
      triggeredSteps: [],
      fact: reflection.facts || "",
      story: reflection.story || "",
      outsideControl: reflection.outsideControl || "",
      insideControl: reflection.insideControl || "",
      chosenResponse: reflection.chosenResponse || "",
      lesson: reflection.intention || reflection.chosenResponse || "",
      moodBefore: null,
      moodAfter: null,
      createdAt: new Date().toISOString()
    };
    setAndPersist((prev) => ({
      ...prev,
      reflections: [entry, ...prev.reflections],
      diary: [diaryEntryFromReflection, ...prev.diary],
      intentions: reflection.intention
        ? [{ id: entry.id, text: reflection.intention, day: currentProgramDay }, ...prev.intentions]
        : prev.intentions,
      startDate: prev.startDate || currentDateKey,
      lastCompletedDay: Math.max(prev.lastCompletedDay, currentProgramDay),
      streak:
        prev.lastCompletedDay === currentProgramDay - 1 || prev.lastCompletedDay === 0
          ? prev.streak + 1
          : prev.streak
    }));
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
    const diaryEntry = {
      id: getRandomId(),
      day: currentProgramDay,
      title: eventText.slice(0, 55) || "Untitled entry",
      rawText: eventText,
      triggeredSteps,
      ...eventForm,
      moodBefore: clampMood(eventForm.moodBefore),
      moodAfter: clampMood(eventForm.moodAfter),
      createdAt: new Date().toISOString()
    };
    setAndPersist((prev) => {
      const nextCompletedDay = Math.max(prev.lastCompletedDay, currentProgramDay);
      return {
        ...prev,
        startDate: prev.startDate || currentDateKey,
        diary: [diaryEntry, ...prev.diary],
        lastCompletedDay: nextCompletedDay,
        streak: nextCompletedDay > 0 ? Math.max(prev.streak, 1) : prev.streak
      };
    });
    setEventText("");
    setAnalysis(null);
    setTab("log");
  }

  function openDiaryEditor(entry) {
    setEditingDiaryId(entry.id);
    setEditingDiaryDraft({
      title: entry.title || "",
      scenario: entry.scenario || "",
      fact: entry.fact || "",
      story: entry.story || "",
      chosenResponse: entry.chosenResponse || "",
      lesson: entry.lesson || ""
    });
    setIsDiaryEditModalOpen(true);
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
              lesson: editingDiaryDraft.lesson
            }
          : entry
      )
    }));
    setIsDiaryEditModalOpen(false);
    setEditingDiaryId(null);
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
      }, 6000);

      return {
        ...prev,
        diary: prev.diary.filter((entry) => entry.id !== entryId)
      };
    });
    if (editingDiaryId === entryId) {
      setIsDiaryEditModalOpen(false);
      setEditingDiaryId(null);
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
      return { ...prev, diary: nextDiary };
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
  const todayDateKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(
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

  const progressDiaryEntries = selectedProgressDate
    ? app.diary.filter((entry) => {
        const entryDate = new Date(entry.createdAt);
        const entryKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, "0")}-${String(
          entryDate.getDate()
        ).padStart(2, "0")}`;
        return entryKey === selectedProgressDate;
      })
    : app.diary;

  if (loading) {
    return <div className="p-10 text-center text-slate-600 dark:text-slate-300">Loading your resilience app...</div>;
  }

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-slate-100 p-4 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 md:p-8">
      <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardContent className="space-y-3 pt-6">
            <div
              className="cursor-pointer rounded-3xl bg-slate-50 p-4 dark:bg-slate-800"
              onClick={() => setIsFocusOpen((prev) => !prev)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setIsFocusOpen((prev) => !prev);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={isFocusOpen ? "Collapse current focus" : "Expand current focus"}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-900 p-2 text-white dark:bg-slate-100 dark:text-slate-900">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>Unshaken</CardTitle>
                    <CardDescription>30-day Resilience</CardDescription>
                  </div>
                </div>
                <div
                  className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
                  aria-hidden="true"
                >
                  {isFocusOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </div>
              {isFocusOpen && (
                <div>
                  <div
                    className="mb-4 rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">About you</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Used to make "What could go wrong today" more specific to your real life.
                    </p>
                    <div className="mt-3 grid gap-2">
                      <Textarea
                        value={profileDraft.age}
                        onChange={(event) => setProfileDraft((prev) => ({ ...prev, age: event.target.value }))}
                        placeholder="Age"
                        className="min-h-[2.75rem]"
                      />
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
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Current focus</p>
                  <>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {weekFocus(currentProgramDay)}
                    </p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{weeklySummary}</p>
                    <Button
                      variant="outline"
                      className="mt-4 w-full justify-start gap-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsDarkMode((prev) => !prev);
                      }}
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
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid min-w-0 gap-6"
          >
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
                    <div className="relative rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">What could go wrong today</p>
                        <div className="flex items-center gap-2">
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
                      <p className="mt-3 break-words pr-8 text-2xl font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">
                        {todayScenario}
                      </p>
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
                      <Textarea
                        value={eventText}
                        onChange={(e) => setEventText(e.target.value)}
                        placeholder="My friend canceled and now I feel rejected."
                        className="min-h-[180px]"
                      />
                      <Button onClick={analyzeEvent} disabled={!eventText.trim() || isAnalyzing}>
                        {isAnalyzing ? "Analyzing..." : "Analyze entry"}
                      </Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Trigger result</CardTitle>
                      <CardDescription>The app picks the right steps.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {analysis ? (
                        <div className="space-y-4">
                          <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
                            <p className="text-sm text-slate-500 dark:text-slate-400">Triggered steps</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {analysis.step1 && <Badge>Step 1: Facts vs Story</Badge>}
                              {analysis.step2 && <Badge>Step 2: Control Filter</Badge>}
                              {analysis.step3 && <Badge>Step 3: Chosen Response</Badge>}
                            </div>
                          </div>
                          <Textarea
                            value={eventForm.fact}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, fact: e.target.value }))}
                            placeholder="Facts"
                          />
                          <Textarea
                            value={eventForm.story}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, story: e.target.value }))}
                            placeholder="Story"
                          />
                          <Textarea
                            value={eventForm.outsideControl}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, outsideControl: e.target.value }))}
                            placeholder="Outside your control"
                          />
                          <Textarea
                            value={eventForm.insideControl}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, insideControl: e.target.value }))}
                            placeholder="Inside your control"
                          />
                          <Textarea
                            value={eventForm.chosenResponse}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, chosenResponse: e.target.value }))}
                            placeholder="Chosen response"
                          />
                          <Textarea
                            value={eventForm.lesson}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, lesson: e.target.value }))}
                            placeholder="Lesson"
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              value={eventForm.moodBefore}
                              onChange={(e) => setEventForm((prev) => ({ ...prev, moodBefore: e.target.value }))}
                            />
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              value={eventForm.moodAfter}
                              onChange={(e) => setEventForm((prev) => ({ ...prev, moodAfter: e.target.value }))}
                            />
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

                <Card>
                  <CardHeader>
                    <SectionTitle icon={BookOpen} title="Diary" subtitle="Your logged events in one place." />
                  </CardHeader>
                  <CardContent>
                    {app.diary.length === 0 ? (
                      <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        No diary entries yet.
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {app.diary.map((entry) => (
                          <div key={entry.id} className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{entry.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  {new Date(entry.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => openDiaryEditor(entry)}>
                                  Edit
                                </Button>
                                <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => deleteDiaryEntry(entry.id)}>
                                  Delete
                                </Button>
                              </div>
                            </div>
                            {entry.scenario && (
                              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{entry.scenario}</p>
                            )}
                            {entry.moodBefore !== null && entry.moodAfter !== null && (
                              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                Mood {entry.moodBefore} to {entry.moodAfter}
                              </p>
                            )}
                            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{entry.lesson || "No lesson logged."}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "progress" && (
              <div className="grid gap-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <SectionTitle icon={LineChart} title="Progress" subtitle="How your patterns are moving." />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                        <span>{app.lastCompletedDay}/30 days complete</span>
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
                              return <div key={`blank-${index}`} className="h-8" />;
                            }
                            const dateKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(
                              dayNumber
                            ).padStart(2, "0")}`;
                            const isSelected = selectedProgressDate === dateKey;
                            const isToday = dateKey === todayDateKey;
                            const hasEntries = app.diary.some((entry) => {
                              const entryDate = new Date(entry.createdAt);
                              const entryKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(
                                2,
                                "0"
                              )}-${String(entryDate.getDate()).padStart(2, "0")}`;
                              return entryKey === dateKey;
                            });

                            return (
                              <button
                                key={dateKey}
                                type="button"
                                onClick={() => setSelectedProgressDate(dateKey)}
                                className={`h-8 rounded-lg border text-xs transition ${
                                  isSelected
                                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                    : isToday
                                      ? "border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-100"
                                      : hasEntries
                                        ? "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                        : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                {dayNumber}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300">Entries: {diaryStats.total}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">Most triggered: {diaryStats.topStep}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">Average mood shift: {diaryStats.averageShift}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">Most common story: {diaryStats.topStory}</p>
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
                        {progressDiaryEntries.map((entry) => (
                          <div key={entry.id} className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{entry.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  {new Date(entry.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => openDiaryEditor(entry)}>
                                  Edit
                                </Button>
                                <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => deleteDiaryEntry(entry.id)}>
                                  Delete
                                </Button>
                              </div>
                            </div>
                            {entry.scenario && (
                              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{entry.scenario}</p>
                            )}
                            {entry.moodBefore !== null && entry.moodAfter !== null && (
                              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                Mood {entry.moodBefore} to {entry.moodAfter}
                              </p>
                            )}
                            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{entry.lesson || "No lesson logged."}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {reflectionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="max-h-[92vh] w-full max-w-3xl overflow-auto">
            <CardHeader>
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

      <div className="mx-auto mt-6 flex w-full min-w-0 max-w-7xl flex-wrap items-center justify-between gap-2 gap-y-3 rounded-3xl bg-white px-4 py-4 text-sm text-slate-500 shadow-sm dark:border dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:px-5">
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
            <CardHeader>
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

      {isMoodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
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
            <CardHeader>
              <CardTitle>Edit diary entry</CardTitle>
              <CardDescription>Update or remove this entry.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={editingDiaryDraft.title}
                onChange={(e) => setEditingDiaryDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Title"
              />
              <Textarea
                value={editingDiaryDraft.scenario}
                onChange={(e) => setEditingDiaryDraft((prev) => ({ ...prev, scenario: e.target.value }))}
                placeholder="Scenario"
              />
              <Textarea
                value={editingDiaryDraft.fact}
                onChange={(e) => setEditingDiaryDraft((prev) => ({ ...prev, fact: e.target.value }))}
                placeholder="Fact"
              />
              <Textarea
                value={editingDiaryDraft.story}
                onChange={(e) => setEditingDiaryDraft((prev) => ({ ...prev, story: e.target.value }))}
                placeholder="Story"
              />
              <Textarea
                value={editingDiaryDraft.chosenResponse}
                onChange={(e) => setEditingDiaryDraft((prev) => ({ ...prev, chosenResponse: e.target.value }))}
                placeholder="Chosen response"
              />
              <Textarea
                value={editingDiaryDraft.lesson}
                onChange={(e) => setEditingDiaryDraft((prev) => ({ ...prev, lesson: e.target.value }))}
                placeholder="Lesson"
              />
              <div className="flex justify-between pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (editingDiaryId) deleteDiaryEntry(editingDiaryId);
                  }}
                >
                  Delete entry
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsDiaryEditModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveDiaryEdit}>Save changes</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {lastDeletedDiaryEntry && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">Diary entry deleted.</p>
            <Button variant="outline" className="px-3 py-1 text-xs" onClick={undoDeleteDiaryEntry}>
              Undo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
