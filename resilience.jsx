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
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const STORAGE_KEY = "resilience-mvp-v1";

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
  "A conversation ends without the validation you hoped for.",
];

const DEFAULT_STATE = {
  day: 1,
  reminderTime: "8:00 AM",
  tone: "Balanced",
  intentions: [],
  reflections: [],
  diary: [],
  lastCompletedDay: 0,
  streak: 0,
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
    "they don't care about me",
    "they dont care about me",
    "i feel rejected",
  ];

  const step2Patterns = [
    "they should",
    "why would they",
    "it's unfair",
    "its unfair",
    "i need them to",
    "i can't believe they",
    "i cant believe they",
    "why did they",
    "they were rude",
    "they ignored me",
    "they need to",
  ];

  const step3Patterns = [
    "what do i do",
    "now what",
    "i want to text",
    "i want to quit",
    "i want to explode",
    "i want to react",
    "should i respond",
    "should i say something",
    "what should i do",
    "i feel like replying",
  ];

  const score = (patterns) =>
    patterns.reduce((total, pattern) => total + (normalized.includes(pattern) ? 1 : 0), 0);

  const step1 = score(step1Patterns);
  const step2 = score(step2Patterns);
  const step3 = score(step3Patterns);

  const triggered = {
    step1: step1 > 0,
    step2: step2 > 0,
    step3: step3 > 0,
  };

  if (!triggered.step1 && !triggered.step2 && !triggered.step3) {
    triggered.step1 = true;
  }

  return {
    ...triggered,
    scores: { step1, step2, step3 },
    ordered: [
      { key: "step1", score: triggered.step1 ? Math.max(step1, 1) : 0 },
      { key: "step2", score: step2 },
      { key: "step3", score: step3 },
    ]
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.key),
  };
}

function getRandomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function runSelfTests() {
  const tests = [];

  const assert = (name, condition) => {
    tests.push({ name, pass: Boolean(condition) });
  };

  assert("clampMood clamps low values", clampMood(0) === 1);
  assert("clampMood clamps high values", clampMood(11) === 10);
  assert("clampMood defaults invalid values", clampMood("abc") === 5);

  const defaultResult = detectSteps("Something difficult happened today.");
  assert("detectSteps defaults to step1", defaultResult.step1 && !defaultResult.step2 && !defaultResult.step3);

  const step1Result = detectSteps("I feel rejected and this means nobody cares.");
  assert("detectSteps finds step1 language", step1Result.step1 === true);

  const step2Result = detectSteps("Why did they ignore me? It's unfair.");
  assert("detectSteps finds step2 language", step2Result.step2 === true);

  const step3Result = detectSteps("What should I do? I want to text them.");
  assert("detectSteps finds step3 language", step3Result.step3 === true);

  const mixedResult = detectSteps("They ignored me and now what should I do?");
  assert("detectSteps can trigger multiple steps", mixedResult.step2 && mixedResult.step3);

  return tests;
}

const SELF_TESTS = runSelfTests();

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

export default function ResilienceMVPApp() {
  const [app, setApp] = useState(DEFAULT_STATE);
  const [tab, setTab] = useState("home");
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflection, setReflection] = useState({
    reaction: "",
    facts: "",
    story: "",
    outsideControl: "",
    insideControl: "",
    chosenResponse: "",
    intention: "",
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
    moodAfter: 6,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setApp({ ...DEFAULT_STATE, ...parsed });
      }
    } catch (error) {
      console.error("Failed to load state", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
    } catch (error) {
      console.error("Failed to save state", error);
    }
  }, [app]);

  const todayScenario = useMemo(() => scenarioForDay(app.day), [app.day]);
  const completionPercent = useMemo(
    () => Math.round((app.lastCompletedDay / 30) * 100),
    [app.lastCompletedDay]
  );

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
            app.diary.reduce(
              (sum, entry) => sum + (Number(entry.moodAfter) - Number(entry.moodBefore)),
              0
            ) / total
          ).toFixed(1);

    const storyCounts = {};
    app.diary.forEach((entry) => {
      const key = entry.story?.trim();
      if (key) storyCounts[key] = (storyCounts[key] || 0) + 1;
    });

    const topStory =
      Object.entries(storyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "You have not logged enough entries yet.";

    return { total, stepCounts, topStep, averageShift, topStory };
  }, [app.diary]);

  const weeklySummary = useMemo(() => {
    const focus = weekFocus(app.day);
    const messages = {
      "Facts vs Story":
        "You are practicing separation between what happened and what your mind adds to it.",
      "Control Filter":
        "You are learning to stop spending energy on what is outside your control.",
      "Chosen Meaning":
        "You are choosing better interpretations before emotion decides for you.",
      Resilience: "You are building steadiness through repetition, not perfection.",
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
      intention: "",
    });
    setReflectionOpen(true);
  }

  function saveReflection() {
    const entry = {
      id: getRandomId(),
      day: app.day,
      scenario: todayScenario,
      ...reflection,
      createdAt: new Date().toISOString(),
    };

    setApp((prev) => ({
      ...prev,
      reflections: [entry, ...prev.reflections],
      intentions: reflection.intention
        ? [{ id: entry.id, text: reflection.intention, day: app.day }, ...prev.intentions]
        : prev.intentions,
      lastCompletedDay: Math.max(prev.lastCompletedDay, prev.day),
      streak:
        prev.lastCompletedDay === prev.day - 1 || prev.lastCompletedDay === 0
          ? prev.streak + 1
          : prev.streak,
      day: prev.day < 30 ? prev.day + 1 : 30,
    }));

    setReflectionOpen(false);
    setTab("home");
  }

  function analyzeEvent() {
    const result = detectSteps(eventText);
    setAnalysis(result);
    setEventForm({
      fact: "",
      story: "",
      outsideControl: "",
      insideControl: "",
      chosenResponse: "",
      lesson: "",
      moodBefore: 4,
      moodAfter: 6,
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
      createdAt: new Date().toISOString(),
    };

    setApp((prev) => ({
      ...prev,
      diary: [diaryEntry, ...prev.diary],
    }));

    setEventText("");
    setAnalysis(null);
    setEventForm({
      fact: "",
      story: "",
      outsideControl: "",
      insideControl: "",
      chosenResponse: "",
      lesson: "",
      moodBefore: 4,
      moodAfter: 6,
    });
    setTab("diary");
  }

  function resetDemo() {
    setApp(DEFAULT_STATE);
    setEventText("");
    setAnalysis(null);
    setReflectionOpen(false);
    localStorage.removeItem(STORAGE_KEY);
  }

  const allTestsPassing = SELF_TESTS.every((test) => test.pass);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="rounded-3xl border-0 shadow-sm">
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

            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Self-check</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {allTestsPassing ? "Core logic tests passing" : "A logic test failed"}
              </p>
            </div>

            <Button variant="outline" className="w-full rounded-2xl" onClick={resetDemo}>
              Reset demo
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-6"
          >
            {tab === "home" && (
              <>
                <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
                  <Card className="rounded-3xl border-0 shadow-sm">
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
                        <p className="mt-3 text-2xl font-semibold leading-snug text-slate-900">
                          {todayScenario}
                        </p>
                        <p className="mt-3 text-sm text-slate-500">
                          Imagine this happens today. Practice the response you want before emotion decides for you.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button className="rounded-2xl" onClick={startReflection}>
                          Start reflection
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() => setTab("log")}
                        >
                          Log real event
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-6">
                    <Card className="rounded-3xl border-0 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-lg">Progress</CardTitle>
                        <CardDescription>Your month-long plan</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span>{app.lastCompletedDay}/30 days complete</span>
                          <span>{completionPercent}%</span>
                        </div>
                        <Progress value={completionPercent} className="h-3" />
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Streak</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">{app.streak}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Reminder</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">{app.reminderTime}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-3xl border-0 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-lg">Latest intention</CardTitle>
                        <CardDescription>What you are practicing right now</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {app.intentions[0] ? (
                          <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-sm text-slate-500">Day {app.intentions[0].day}</p>
                            <p className="mt-2 text-lg font-medium text-slate-900">
                              “{app.intentions[0].text}”
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            Complete your first reflection to save a daily intention.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <Card className="rounded-3xl border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">How this works</CardTitle>
                    <CardDescription>A simple 3-step method for daily resilience</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3">
                    {[
                      [
                        "Step 1",
                        "Facts vs Story",
                        "Separate what happened from what your mind added to it.",
                      ],
                      [
                        "Step 2",
                        "Control Filter",
                        "Stop spending energy on what you cannot control.",
                      ],
                      [
                        "Step 3",
                        "Chosen Response",
                        "Pick the response that protects your peace and self-respect.",
                      ],
                    ].map(([eyebrow, title, copy]) => (
                      <div key={title} className="rounded-3xl bg-slate-50 p-5">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{copy}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}

            {tab === "log" && (
              <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
                <Card className="rounded-3xl border-0 shadow-sm">
                  <CardHeader>
                    <SectionTitle
                      icon={NotebookPen}
                      title="Log what happened"
                      subtitle="Write it in your own words. The app will guide you."
                    />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={eventText}
                      onChange={(e) => setEventText(e.target.value)}
                      placeholder="My friend canceled and now I feel rejected."
                      className="min-h-[180px] rounded-2xl border-slate-200 bg-slate-50"
                    />
                    <div className="flex flex-wrap gap-2">
                      {["Rejection", "Criticism", "Uncertainty", "Embarrassment", "Anger"].map((tag) => (
                        <Badge key={tag} variant="secondary" className="rounded-full px-3 py-1">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Button className="rounded-2xl" onClick={analyzeEvent} disabled={!eventText.trim()}>
                      Analyze entry
                    </Button>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Trigger result</CardTitle>
                    <CardDescription>The app decides which steps to guide first</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analysis ? (
                      <div className="space-y-4">
                        <div className="rounded-3xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">Triggered steps</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {analysis.step1 && (
                              <Badge className="rounded-full">Step 1: Facts vs Story</Badge>
                            )}
                            {analysis.step2 && (
                              <Badge className="rounded-full">Step 2: Control Filter</Badge>
                            )}
                            {analysis.step3 && (
                              <Badge className="rounded-full">Step 3: Chosen Response</Badge>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">Facts</label>
                            <Textarea
                              value={eventForm.fact}
                              onChange={(e) =>
                                setEventForm((prev) => ({ ...prev, fact: e.target.value }))
                              }
                              placeholder="What literally happened?"
                              className="rounded-2xl bg-slate-50"
                            />
                          </div>

                          {analysis.step1 && (
                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">Story</label>
                              <Textarea
                                value={eventForm.story}
                                onChange={(e) =>
                                  setEventForm((prev) => ({ ...prev, story: e.target.value }))
                                }
                                placeholder="What story did your mind add?"
                                className="rounded-2xl bg-slate-50"
                              />
                            </div>
                          )}

                          {analysis.step2 && (
                            <>
                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700">
                                  Outside your control
                                </label>
                                <Textarea
                                  value={eventForm.outsideControl}
                                  onChange={(e) =>
                                    setEventForm((prev) => ({
                                      ...prev,
                                      outsideControl: e.target.value,
                                    }))
                                  }
                                  placeholder="What part is not yours to control?"
                                  className="rounded-2xl bg-slate-50"
                                />
                              </div>
                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700">
                                  Inside your control
                                </label>
                                <Textarea
                                  value={eventForm.insideControl}
                                  onChange={(e) =>
                                    setEventForm((prev) => ({
                                      ...prev,
                                      insideControl: e.target.value,
                                    }))
                                  }
                                  placeholder="What part belongs to your response?"
                                  className="rounded-2xl bg-slate-50"
                                />
                              </div>
                            </>
                          )}

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">
                              Chosen response
                            </label>
                            <Textarea
                              value={eventForm.chosenResponse}
                              onChange={(e) =>
                                setEventForm((prev) => ({
                                  ...prev,
                                  chosenResponse: e.target.value,
                                }))
                              }
                              placeholder={
                                analysis.step3
                                  ? "What response would protect your peace and self-respect?"
                                  : "What do you want to do next?"
                              }
                              className="rounded-2xl bg-slate-50"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">Lesson</label>
                            <Input
                              value={eventForm.lesson}
                              onChange={(e) =>
                                setEventForm((prev) => ({ ...prev, lesson: e.target.value }))
                              }
                              placeholder="What is the one thing you want to remember?"
                              className="rounded-2xl bg-slate-50"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
                                Mood before (1-10)
                              </label>
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                value={eventForm.moodBefore}
                                onChange={(e) =>
                                  setEventForm((prev) => ({ ...prev, moodBefore: e.target.value }))
                                }
                                className="rounded-2xl bg-slate-50"
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-700">
                                Mood after (1-10)
                              </label>
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                value={eventForm.moodAfter}
                                onChange={(e) =>
                                  setEventForm((prev) => ({ ...prev, moodAfter: e.target.value }))
                                }
                                className="rounded-2xl bg-slate-50"
                              />
                            </div>
                          </div>
                        </div>

                        <Button className="w-full rounded-2xl" onClick={saveEventEntry}>
                          Save to diary
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-3xl bg-slate-50 p-5 text-sm leading-6 text-slate-500">
                        Write a real event, then analyze it. The app will trigger Step 1, 2, or 3 based on your wording.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "diary" && (
              <Card className="rounded-3xl border-0 shadow-sm">
                <CardHeader>
                  <SectionTitle
                    icon={BookOpen}
                    title="Diary"
                    subtitle="Every reflection and real-life event becomes usable data."
                  />
                </CardHeader>
                <CardContent>
                  {app.diary.length === 0 ? (
                    <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">
                      No diary entries yet. Log a real event to start building your month.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {app.diary.map((entry) => (
                        <div key={entry.id} className="rounded-3xl bg-slate-50 p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">{entry.title}</h3>
                              <p className="mt-1 text-sm text-slate-500">
                                {new Date(entry.createdAt).toLocaleDateString([], {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {entry.triggeredSteps.map((step) => (
                                <Badge key={step} variant="secondary" className="rounded-full">
                                  {step === "step1"
                                    ? "Step 1"
                                    : step === "step2"
                                      ? "Step 2"
                                      : "Step 3"}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Fact</p>
                              <p className="mt-1 text-sm text-slate-700">{entry.fact || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Story</p>
                              <p className="mt-1 text-sm text-slate-700">{entry.story || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                                Inside your control
                              </p>
                              <p className="mt-1 text-sm text-slate-700">{entry.insideControl || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                                Chosen response
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                {entry.chosenResponse || "—"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                            <p className="text-sm text-slate-600">
                              <span className="font-medium text-slate-900">Lesson:</span> {entry.lesson || "—"}
                            </p>
                            <p className="text-sm text-slate-500">
                              Mood: {entry.moodBefore} → {entry.moodAfter}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {tab === "progress" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="rounded-3xl border-0 shadow-sm">
                  <CardHeader>
                    <SectionTitle
                      icon={LineChart}
                      title="Progress"
                      subtitle="A simple read on what is changing."
                    />
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Entries saved</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-900">{diaryStats.total}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Most triggered step</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-900">
                        {diaryStats.topStep === "step1"
                          ? "Step 1"
                          : diaryStats.topStep === "step2"
                            ? "Step 2"
                            : "Step 3"}
                      </p>
                    </div>
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Average mood shift</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-900">{diaryStats.averageShift}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Completed days</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-900">{app.lastCompletedDay}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Weekly summary</CardTitle>
                    <CardDescription>Your current pattern, simplified</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <p className="text-sm text-slate-500">This week’s focus</p>
                      <p className="mt-2 text-xl font-semibold text-slate-900">{weekFocus(app.day)}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{weeklySummary}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <p className="text-sm text-slate-500">Most common story</p>
                      <p className="mt-2 text-base font-medium leading-7 text-slate-900">
                        {diaryStats.topStory}
                      </p>
                    </div>
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <p className="text-sm text-slate-500">What to practice next</p>
                      <p className="mt-2 text-base leading-7 text-slate-900">
                        Start with facts. Then separate what belongs to you from what does not. Only after that choose your response.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {reflectionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl border-0 shadow-2xl">
            <CardHeader>
              <SectionTitle
                icon={Brain}
                title="Morning reflection"
                subtitle="Practice the response before the moment happens."
              />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Scenario</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{todayScenario}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  What reaction usually comes up first?
                </label>
                <Textarea
                  value={reflection.reaction}
                  onChange={(e) => setReflection((prev) => ({ ...prev, reaction: e.target.value }))}
                  placeholder="I usually assume..."
                  className="rounded-2xl bg-slate-50"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Step 1: Facts</label>
                  <Textarea
                    value={reflection.facts}
                    onChange={(e) => setReflection((prev) => ({ ...prev, facts: e.target.value }))}
                    placeholder="What are the facts?"
                    className="rounded-2xl bg-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Step 1: Story</label>
                  <Textarea
                    value={reflection.story}
                    onChange={(e) => setReflection((prev) => ({ ...prev, story: e.target.value }))}
                    placeholder="What story might you add?"
                    className="rounded-2xl bg-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Step 2: Outside your control
                  </label>
                  <Textarea
                    value={reflection.outsideControl}
                    onChange={(e) =>
                      setReflection((prev) => ({ ...prev, outsideControl: e.target.value }))
                    }
                    placeholder="What is outside your control?"
                    className="rounded-2xl bg-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Step 2: Inside your control
                  </label>
                  <Textarea
                    value={reflection.insideControl}
                    onChange={(e) =>
                      setReflection((prev) => ({ ...prev, insideControl: e.target.value }))
                    }
                    placeholder="What is in your control?"
                    className="rounded-2xl bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Step 3: Chosen response
                </label>
                <Textarea
                  value={reflection.chosenResponse}
                  onChange={(e) =>
                    setReflection((prev) => ({ ...prev, chosenResponse: e.target.value }))
                  }
                  placeholder="What response would make you stronger?"
                  className="rounded-2xl bg-slate-50"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Daily intention</label>
                <Input
                  value={reflection.intention}
                  onChange={(e) => setReflection((prev) => ({ ...prev, intention: e.target.value }))}
                  placeholder="Silence is not always rejection."
                  className="rounded-2xl bg-slate-50"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <Button variant="outline" className="rounded-2xl" onClick={() => setReflectionOpen(false)}>
                  Cancel
                </Button>
                <Button className="rounded-2xl" onClick={saveReflection}>
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
          <span>Reminder set to {app.reminderTime}</span>
        </div>
        <span>Tone: {app.tone}</span>
      </div>
    </div>
  );
}
