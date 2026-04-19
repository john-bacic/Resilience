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
    parts.push(
      `The resilience step that shows up most in your text is "${STEP_LABELS[top[0]]}" (${top[1]} ${top[1] === 1 ? "hit" : "hits"} across entries).`
    );
  }
  if (moodShifts > 0) {
    const avg = (moodShiftSum / moodShifts).toFixed(1);
    parts.push(`Average mood change where you logged before/after: ${avg >= 0 ? "+" : ""}${avg} on your scale (${moodShifts} ${moodShifts === 1 ? "entry" : "entries"}).`);
  }
  if (parts.length === 0) {
    parts.push(
      `You have ${entries.length} ${entries.length === 1 ? "entry" : "entries"}. Add patterns by logging moods and using Analyze on the Log flow, or set ANTHROPIC_API_KEY for a full narrative read.`
    );
  }

  return {
    source: "fallback",
    overview: parts.join(" "),
    patterns: [],
    caveat: "Set ANTHROPIC_API_KEY for AI-written themes and blind-spot notes from your full journal."
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
        temperature: 0.35,
        system: `You are a resilience journaling coach. Read the user's diary entries (newest first) and summarize real patterns — recurring stories, triggers, mood trends, what helps — only grounded in the text. Avoid generic therapy platitudes. Return strict JSON only with keys: overview (one short paragraph), patterns (array of 3-6 short bullet strings), caveat (one sentence on what the analysis might miss or limits of the data).`,
        messages: [
          {
            role: "user",
            content: `Diary entries (JSON, newest first):\n${JSON.stringify(entries)}`
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
      overview: overview || patterns[0] || "Patterns noted from your journal.",
      patterns: patterns.slice(0, 8),
      caveat: caveat || "Patterns are inferred from logged text only."
    });
  } catch (e) {
    console.error("[diary-insights]", e);
    return Response.json(fallbackFromEntries(entries));
  }
}
