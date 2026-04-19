import { requireAuthUserId } from "@/lib/require-auth";
import {
  detectStepsStrict,
  stepIdsFromFlags,
  STEP_LABELS
} from "@/lib/trigger-steps";

function cleanJsonText(text) {
  return String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function fallbackFromEntries(entries) {
  const stepCounts = { step1: 0, step2: 0, step3: 0 };
  let moodShifts = 0;
  let moodShiftSum = 0;

  for (const e of entries) {
    const text = [e.story, e.fact, e.lesson, e.scenario, e.rawText]
      .map((x) => (x != null ? String(x) : ""))
      .join("\n");
    const stored = Array.isArray(e.triggeredSteps) ? e.triggeredSteps : [];
    const filtered = stored.filter((s) => s === "step1" || s === "step2" || s === "step3");
    const ids = filtered.length > 0 ? filtered : stepIdsFromFlags(detectStepsStrict(text));
    for (const id of ids) {
      if (stepCounts[id] !== undefined) stepCounts[id] += 1;
    }
    if (e.moodBefore != null && e.moodAfter != null) {
      const a = Number(e.moodBefore);
      const b = Number(e.moodAfter);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        moodShifts += 1;
        moodShiftSum += b - a;
      }
    }
  }

  const ranked = Object.entries(stepCounts).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const parts = [];
  if (top && top[1] > 0) {
    const label = STEP_LABELS[top[0]];
    const n = top[1];
    parts.push(
      n === 1
        ? `I keep seeing you circle back to “${label}” in what you wrote — it’s showing up as a real thread for you.`
        : `You come back to “${label}” a lot in your entries — like ${n} times. That’s not random; it’s something your mind keeps working.`
    );
  }
  if (moodShifts > 0) {
    const avg = (moodShiftSum / moodShifts).toFixed(1);
    const sign = Number(avg) >= 0 ? "+" : "";
    parts.push(
      `When you’ve logged how you felt before and after, you’re shifting about ${sign}${avg} on average — small but real movement across ${moodShifts} ${moodShifts === 1 ? "time" : "times"} you checked in.`
    );
  }
  if (parts.length === 0) {
    parts.push(
      `You’ve got ${entries.length} ${entries.length === 1 ? "entry" : "entries"} here — I don’t have enough hooks yet to mirror much back. Log moods when you can and use Analyze on the Log flow so I can sound more like I actually read you; add ANTHROPIC_API_KEY if you want the richer read.`
    );
  }

  return {
    source: "fallback",
    overview: parts.join(" "),
    patterns: [],
    caveat:
      "This is the quick on-device version — add ANTHROPIC_API_KEY if you want me to go deeper and sound even more like someone who sat with every line."
  };
}

export async function POST(request) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = Array.isArray(body?.entries) ? body.entries : [];
  const entries = raw.slice(0, 60);
  if (entries.length === 0) {
    return Response.json({ error: "entries array required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(fallbackFromEntries(entries));
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.5,
        system: `You are replying as a close friend who just read their private journal — not a therapist, not a lab report. Write in second person (you / your). Sound warm, direct, a little informal; contractions are fine. Talk *to* them about *their* thoughts: mirror what they actually said, name the tensions or wins you see in their own words. Phrases like "sounds like…", "I keep noticing you…", "that must’ve felt…" are good. Never say "the user", "the individual", or write like a case study.

Stay 100% grounded in what’s in the entries — no invented events or emotions. If the data is thin, say so honestly in the caveat in the same friend voice (not corporate).

Return strict JSON only with these keys:
- overview: one paragraph, 2–5 short sentences, like a text from someone who gets you.
- patterns: array of 3–6 strings; each line is something a friend might say over coffee — not clinical bullet points, no "Step 1 / Step 2" jargon unless they used that language.
- caveat: one sentence, warm, about what you might be missing or what’s fuzzy — still human.

Avoid: therapy-speak ("hold space", "validate", "coping strategies"), "it is recommended", "analysis indicates", stiff summaries, numbered observations that sound like a form.`,
        messages: [
          {
            role: "user",
            content: `Here are their diary entries (newest first). Read them and talk back like you’re their friend, not their clinician:\n${JSON.stringify(entries)}`
          }
        ]
      })
    });

    if (!response.ok) {
      return Response.json(fallbackFromEntries(entries));
    }

    const payload = await response.json();
    const text = payload?.content?.find((item) => item?.type === "text")?.text?.trim() || "";
    const cleaned = cleanJsonText(text);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return Response.json(fallbackFromEntries(entries));
    }

    const overview = String(parsed?.overview || "").trim();
    const patterns = Array.isArray(parsed?.patterns)
      ? parsed.patterns.map((p) => String(p || "").trim()).filter(Boolean)
      : [];
    const caveat = String(parsed?.caveat || "").trim();

    if (!overview && patterns.length === 0) {
      return Response.json(fallbackFromEntries(entries));
    }

    return Response.json({
      source: "ai",
      overview:
        overview ||
        patterns[0] ||
        "I read what you logged — there’s more in here than a one-line summary can catch, but I’m glad you’re writing it down.",
      patterns: patterns.slice(0, 8),
      caveat:
        caveat ||
        "I only know what made it into these entries — anything you didn’t write down, I’m guessing at."
    });
  } catch (e) {
    console.error("[diary-insights]", e);
    return Response.json(fallbackFromEntries(entries));
  }
}
