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

/** Strips common AI hedges / “open invitation” closers the product doesn’t want shown. */
function stripUnwantedInsightPhrases(text) {
  let s = String(text || "");
  // "But there may be more going on beneath the surface… let me know if… talk through"
  s = s.replace(
    /\s*(?:But\s+)?there\s+may\s+be\s+more\s+going\s+on\s+beneath\s+the\s+surface\s+that\s+I['']m\s+not\s+seeing\s*[-–—]\s*let\s+me\s+know\s+if\s+there['']s\s+anything\s+else\s+you\s+want\s+to\s+talk\s+through\.?/gi,
    ""
  );
  return s.replace(/\s{2,}/g, " ").trim();
}

/**
 * @param {string} [options.fallbackReason]
 * - `missing_api_key` — server has no ANTHROPIC_API_KEY (e.g. not set on Vercel)
 * - `anthropic_http` — Anthropic returned non-OK status
 * - `parse_error` — response wasn’t valid JSON
 * - `empty_ai` — model returned no usable overview/patterns
 */
function fallbackFromEntries(entries, options = {}) {
  const { fallbackReason = "missing_api_key" } = options;
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

  const caveatByReason =
    fallbackReason === "missing_api_key"
      ? "This is the quick on-device version — add ANTHROPIC_API_KEY to the server (e.g. Vercel → Environment Variables) if you want the full AI read."
      : fallbackReason === "anthropic_http"
        ? "The full AI read didn’t load (Anthropic returned an error). What’s above is a quick on-device summary from your entries."
        : fallbackReason === "parse_error"
          ? "The full AI reply didn’t parse. What’s above is a quick on-device summary from your entries."
          : "The model returned nothing usable. What’s above is a quick on-device summary from your entries.";

  return {
    source: "fallback",
    fallbackReason,
    overview: parts.join(" "),
    patterns: [],
    caveat: caveatByReason
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

  const apiKey = typeof process.env.ANTHROPIC_API_KEY === "string" ? process.env.ANTHROPIC_API_KEY.trim() : "";
  if (!apiKey) {
    return Response.json(fallbackFromEntries(entries, { fallbackReason: "missing_api_key" }));
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
        system: `You are replying as a kind, gentle friend who just read this person’s journal — you are talking *to them*, not *about* them.

Mandatory voice:
- Use **only second person**: "you", "your", "you’re". Speak as if you’re sitting with them.
- **Never** use: "the writer", "the author", "this person", "they/them" (when meaning the person who wrote), "one", or any third-person label for the journal-keeper. If you catch yourself describing them from the outside, rewrite to "you".
- Tone: warm, gentle, supportive — never clinical, distant, or like a book report.

Mirror what *they* actually wrote (facts from the entries only). Phrases like "it sounds like you…", "I notice you…", "that must have been a lot" are good.

Stay 100% grounded in the entries — no invented events or emotions. If the data is thin, say so kindly in the caveat.

Return strict JSON only with these keys:
- overview: one paragraph, 2–5 short sentences, every sentence addressed to "you".
- patterns: array of 3–6 strings; each line speaks to "you" (like gentle observations a friend would make), not about "the writer".
- caveat: **one short sentence** about limits of what you can see from the text (e.g. missing context). **Do not** invite ongoing conversation, therapy follow-ups, or lines like "beneath the surface", "let me know if you want to talk", "let me know if there's anything else", or similar — end cleanly.

Avoid: therapy jargon, "analysis indicates", "the user", case-study voice, bullet labels like "Observation 1".`,
        messages: [
          {
            role: "user",
            content: `Journal entries from the person you’re speaking to (newest first). Remember: answer only in second person — you’re talking back to them, kindly:\n${JSON.stringify(entries)}`
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[diary-insights] Anthropic HTTP", response.status, errText.slice(0, 800));
      return Response.json(fallbackFromEntries(entries, { fallbackReason: "anthropic_http" }));
    }

    const payload = await response.json();
    const text = payload?.content?.find((item) => item?.type === "text")?.text?.trim() || "";
    const cleaned = cleanJsonText(text);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[diary-insights] JSON parse failed, raw:", cleaned.slice(0, 400));
      return Response.json(fallbackFromEntries(entries, { fallbackReason: "parse_error" }));
    }

    let overview = stripUnwantedInsightPhrases(String(parsed?.overview || "").trim());
    const patternsRaw = Array.isArray(parsed?.patterns)
      ? parsed.patterns.map((p) => stripUnwantedInsightPhrases(String(p || "").trim())).filter(Boolean)
      : [];
    let caveat = stripUnwantedInsightPhrases(String(parsed?.caveat || "").trim());

    if (!overview && patternsRaw.length === 0) {
      return Response.json(fallbackFromEntries(entries, { fallbackReason: "empty_ai" }));
    }

    return Response.json({
      source: "ai",
      overview:
        overview ||
        patternsRaw[0] ||
        "I read what you logged — there’s more in here than a one-line summary can catch, but I’m glad you’re writing it down.",
      patterns: patternsRaw.slice(0, 8),
      caveat:
        caveat ||
        "I only know what made it into these entries — anything you didn’t write down, I’m guessing at."
    });
  } catch (e) {
    console.error("[diary-insights]", e);
    return Response.json(fallbackFromEntries(entries, { fallbackReason: "anthropic_http" }));
  }
}
