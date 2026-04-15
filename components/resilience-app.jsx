"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Home,
  LineChart,
  NotebookPen,
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
  reminderTime: "8:00 AM",
  tone: "Balanced",
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
  return <div className={`rounded-3xl border-0 bg-white shadow-sm ${className}`}>{children}</div>;
}
function CardHeader({ className = "", children }) {
  return <div className={`p-6 pb-3 ${className}`}>{children}</div>;
}
function CardTitle({ className = "", children }) {
  return <h3 className={`text-lg font-semibold text-slate-900 ${className}`}>{children}</h3>;
}
function CardDescription({ className = "", children }) {
  return <p className={`text-sm text-slate-500 ${className}`}>{children}</p>;
}
function CardContent({ className = "", children }) {
  return <div className={`p-6 pt-3 ${className}`}>{children}</div>;
}
function Button({ className = "", variant = "default", children, ...props }) {
  const base = "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm transition";
  const style =
    variant === "outline"
      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      : "bg-slate-900 text-white hover:bg-slate-800";
  return (
    <button className={`${base} ${style} ${className}`} {...props}>
      {children}
    </button>
  );
}
function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm ${
        props.className || ""
      }`}
    />
  );
}
function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm ${
        props.className || ""
      }`}
    />
  );
}
function Badge({ children, className = "" }) {
  return (
    <span className={`rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 ${className}`}>
      {children}
    </span>
  );
}
function Progress({ value }) {
  return (
    <div className="h-3 w-full rounded-full bg-slate-200">
      <div className="h-3 rounded-full bg-slate-900" style={{ width: `${value}%` }} />
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm transition ${
        active ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-slate-900 p-2 text-white">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

export default function ResilienceApp() {
  const [app, setApp] = useState(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("home");
  const [reflectionOpen, setReflectionOpen] = useState(false);
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

  async function persistState(nextState) {
    try {
      setSaving(true);
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextState })
      });
      if (!response.ok) throw new Error("Failed to save");
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

  const todayScenario = useMemo(() => scenarioForDay(app.day), [app.day]);
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
    const focus = weekFocus(app.day);
    const messages = {
      "Facts vs Story": "You are separating what happened from what your mind adds to it.",
      "Control Filter": "You are cutting wasted energy on what is outside your control.",
      "Chosen Meaning": "You are choosing interpretations before emotion chooses for you.",
      Resilience: "You are building steadiness through repetition, not perfection."
    };
    return messages[focus];
  }, [app.day]);

  function startReflection() {
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

  function saveReflection() {
    const entry = {
      id: getRandomId(),
      day: app.day,
      scenario: todayScenario,
      ...reflection,
      createdAt: new Date().toISOString()
    };
    setAndPersist((prev) => ({
      ...prev,
      reflections: [entry, ...prev.reflections],
      intentions: reflection.intention
        ? [{ id: entry.id, text: reflection.intention, day: app.day }, ...prev.intentions]
        : prev.intentions,
      lastCompletedDay: Math.max(prev.lastCompletedDay, prev.day),
      streak: prev.lastCompletedDay === prev.day - 1 || prev.lastCompletedDay === 0 ? prev.streak + 1 : prev.streak,
      day: prev.day < 30 ? prev.day + 1 : 30
    }));
    setReflectionOpen(false);
  }

  function analyzeEvent() {
    setAnalysis(detectSteps(eventText));
    setEventForm({
      fact: "",
      story: "",
      outsideControl: "",
      insideControl: "",
      chosenResponse: "",
      lesson: "",
      moodBefore: 4,
      moodAfter: 6
    });
  }

  function saveEventEntry() {
    if (!analysis) return;
    const triggeredSteps = [];
    if (analysis.step1) triggeredSteps.push("step1");
    if (analysis.step2) triggeredSteps.push("step2");
    if (analysis.step3) triggeredSteps.push("step3");
    const diaryEntry = {
      id: getRandomId(),
      title: eventText.slice(0, 55) || "Untitled entry",
      rawText: eventText,
      triggeredSteps,
      ...eventForm,
      moodBefore: clampMood(eventForm.moodBefore),
      moodAfter: clampMood(eventForm.moodAfter),
      createdAt: new Date().toISOString()
    };
    setAndPersist((prev) => ({ ...prev, diary: [diaryEntry, ...prev.diary] }));
    setEventText("");
    setAnalysis(null);
    setTab("diary");
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-600">Loading your resilience app...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-900 p-2 text-white">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Unshaken</CardTitle>
                <CardDescription>30-day resilience MVP</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <NavButton active={tab === "home"} icon={Home} label="Home" onClick={() => setTab("home")} />
            <NavButton active={tab === "log"} icon={NotebookPen} label="Log" onClick={() => setTab("log")} />
            <NavButton active={tab === "diary"} icon={BookOpen} label="Diary" onClick={() => setTab("diary")} />
            <NavButton active={tab === "progress"} icon={LineChart} label="Progress" onClick={() => setTab("progress")} />
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current focus</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{weekFocus(app.day)}</p>
              <p className="mt-2 text-sm text-slate-500">{weeklySummary}</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6">
            {tab === "home" && (
              <Card>
                <CardHeader>
                  <SectionTitle
                    icon={Sparkles}
                    title={`Day ${Math.min(app.day, 30)} of 30`}
                    subtitle="Train yourself to respond, not react."
                  />
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-3xl bg-slate-50 p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Today’s scenario</p>
                    <p className="mt-3 text-2xl font-semibold leading-snug text-slate-900">{todayScenario}</p>
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
            )}

            {tab === "log" && (
              <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
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
                    <Button onClick={analyzeEvent} disabled={!eventText.trim()}>
                      Analyze entry
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
                        <div className="rounded-3xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">Triggered steps</p>
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
                        <Input
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
                      <p className="rounded-3xl bg-slate-50 p-5 text-sm text-slate-500">
                        Analyze an entry to trigger guided prompts.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "diary" && (
              <Card>
                <CardHeader>
                  <SectionTitle icon={BookOpen} title="Diary" subtitle="Your events and reflections." />
                </CardHeader>
                <CardContent>
                  {app.diary.length === 0 ? (
                    <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">No diary entries yet.</div>
                  ) : (
                    <div className="grid gap-4">
                      {app.diary.map((entry) => (
                        <div key={entry.id} className="rounded-3xl bg-slate-50 p-5">
                          <h3 className="text-lg font-semibold text-slate-900">{entry.title}</h3>
                          <p className="text-sm text-slate-500">
                            {new Date(entry.createdAt).toLocaleDateString()} - Mood {entry.moodBefore} to {entry.moodAfter}
                          </p>
                          <p className="mt-2 text-sm text-slate-700">{entry.lesson || "No lesson logged."}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {tab === "progress" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <SectionTitle icon={LineChart} title="Progress" subtitle="How your patterns are moving." />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span>{app.lastCompletedDay}/30 days complete</span>
                      <span>{completionPercent}%</span>
                    </div>
                    <Progress value={completionPercent} />
                    <p className="text-sm text-slate-700">Entries: {diaryStats.total}</p>
                    <p className="text-sm text-slate-700">Most triggered: {diaryStats.topStep}</p>
                    <p className="text-sm text-slate-700">Average mood shift: {diaryStats.averageShift}</p>
                    <p className="text-sm text-slate-700">Most common story: {diaryStats.topStory}</p>
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
              <Textarea
                value={reflection.reaction}
                onChange={(e) => setReflection((prev) => ({ ...prev, reaction: e.target.value }))}
                placeholder="What reaction usually comes first?"
              />
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
              <Input
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

      <div className="mx-auto mt-6 flex max-w-7xl items-center justify-between rounded-3xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>Reminder {app.reminderTime}</span>
        </div>
        <span>{saving ? "Saving..." : `Tone: ${app.tone}`}</span>
      </div>
    </div>
  );
}
