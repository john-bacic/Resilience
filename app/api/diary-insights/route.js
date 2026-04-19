import { jsonrepair } from "jsonrepair";
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

/** Concatenate all `text` blocks (fallback when not using tool_use). */
function anthropicAssistantText(payload) {
  const blocks = payload?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

/** Prefer structured tool output — no JSON.parse on prose (avoids parse_error). */
function extractJournalInsightsToolInput(payload) {
  const blocks = payload?.content;
  if (!Array.isArray(blocks)) return null;
  for (const block of blocks) {
    if (
      block?.type === "tool_use" &&
      block?.name === "submit_journal_insights" &&
      block?.input &&
      typeof block.input === "object"
    ) {
      return block.input;
    }
  }
  return null;
}

/**
 * First top-level `{ ... }` with string-aware brace matching (handles `}` inside overview strings).
 */
function extractFirstJsonObject(str) {
  const start = str.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escapeNext = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

/** Normalize smart quotes that break JSON.parse. */
function normalizeJsonQuotes(s) {
  return s.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
}

function parseModelInsightsJson(raw) {
  let t = String(raw || "").trim();
  t = t.replace(/^\uFEFF/, "");
  t = cleanJsonText(t);
  t = normalizeJsonQuotes(t);

  let candidate = extractFirstJsonObject(t);
  if (!candidate) {
    const i0 = t.indexOf("{");
    const i1 = t.lastIndexOf("}");
    if (i0 !== -1 && i1 > i0) candidate = t.slice(i0, i1 + 1);
  }
  if (!candidate) return null;

  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      try {
        const repaired = jsonrepair(s);
        return JSON.parse(repaired);
      } catch {
        return null;
      }
    }
  };

  return tryParse(candidate);
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

  const INSIGHTS_TOOL = {
    name: "submit_journal_insights",
    description:
      "Submit your journal reflection for the user. You must call this tool once with the full analysis — do not reply with raw JSON in chat text.",
    input_schema: {
      type: "object",
      properties: {
        overview: {
          type: "string",
          description:
            "One paragraph, 2–5 short sentences, second person (you/your), kind friend tone."
        },
        patterns: {
          type: "array",
          items: { type: "string" },
          description: "3–6 short lines, each speaking to 'you' gently."
        },
        caveat: {
          type: "string",
          description:
            "One short sentence on limits of what you can see from the text. No invitations to 'talk through' more."
        }
      },
      required: ["overview", "patterns", "caveat"]
    }
  };

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
        max_tokens: 2048,
        temperature: 0.45,
        tools: [INSIGHTS_TOOL],
        tool_choice: {
          type: "tool",
          name: "submit_journal_insights",
          disable_parallel_tool_use: true
        },
        system: `You are a kind, gentle friend who read this person’s journal. Talk *to* them (you/your), never *about* them as "the writer" or third person.

Mirror only what appears in the entries. Warm, direct, not clinical.

You must call the tool submit_journal_insights exactly once with overview, patterns, and caveat. Do not paste JSON as plain text in the chat.`,
        messages: [
          {
            role: "user",
            content: `Their diary entries (JSON, newest first). Respond only by calling submit_journal_insights:\n${JSON.stringify(entries)}`
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

    let parsed = extractJournalInsightsToolInput(payload);
    if (!parsed) {
      const text = anthropicAssistantText(payload).trim();
      if (text) {
        parsed = parseModelInsightsJson(text);
      }
      if (!parsed || typeof parsed !== "object") {
        console.error(
          "[diary-insights] No tool_use and text parse failed. stop_reason:",
          payload?.stop_reason,
          "content:",
          JSON.stringify(payload?.content)?.slice(0, 1500)
        );
        return Response.json(fallbackFromEntries(entries, { fallbackReason: "parse_error" }));
      }
    }

    let overview = stripUnwantedInsightPhrases(String(parsed?.overview ?? "").trim());
    let patternsRaw = Array.isArray(parsed?.patterns)
      ? parsed.patterns.map((p) => stripUnwantedInsightPhrases(String(p ?? "").trim())).filter(Boolean)
      : [];
    if (patternsRaw.length === 0 && typeof parsed?.patterns === "string" && String(parsed.patterns).trim()) {
      patternsRaw = [stripUnwantedInsightPhrases(String(parsed.patterns).trim())];
    }
    let caveat = stripUnwantedInsightPhrases(String(parsed?.caveat ?? "").trim());

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
