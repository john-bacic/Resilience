import { requireAuthUserId } from "@/lib/require-auth";

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

const step2Patterns = ["they should", "it's unfair", "its unfair", "why did they", "they ignored me", "they need to"];

const step3Patterns = ["what do i do", "now what", "i want to text", "i want to quit", "i want to react", "what should i do"];

function detectSteps(text) {
  const normalized = String(text || "").toLowerCase();
  const score = (patterns) =>
    patterns.reduce((total, pattern) => total + (normalized.includes(pattern) ? 1 : 0), 0);
  const step1 = score(step1Patterns) > 0;
  const step2 = score(step2Patterns) > 0;
  const step3 = score(step3Patterns) > 0;
  if (!step1 && !step2 && !step3) {
    return { step1: true, step2: false, step3: false };
  }
  return { step1, step2, step3 };
}

function fallbackAnalysis(entryText) {
  return {
    triggered: detectSteps(entryText),
    fact: "",
    story: "",
    outsideControl: "",
    insideControl: "",
    chosenResponse: "",
    lesson: ""
  };
}

export async function POST(request) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;

  try {
    const body = await request.json();
    const entryText = String(body?.entryText || "").trim();
    if (!entryText) {
      return Response.json({ error: "entryText is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ analysis: fallbackAnalysis(entryText), source: "fallback" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307",
        max_tokens: 500,
        temperature: 0.4,
        system:
          "You are a resilience journaling coach. Return strict JSON only with keys: triggered, fact, story, outsideControl, insideControl, chosenResponse, lesson. triggered must be an object with booleans step1 step2 step3. Keep text concise, practical, and in casual everyday language.",
        messages: [
          {
            role: "user",
            content: `Analyze this log entry and prefill journaling fields.
Write naturally and casually (not formal).

${entryText}`
          }
        ]
      })
    });

    if (!response.ok) {
      return Response.json({ analysis: fallbackAnalysis(entryText), source: "fallback" });
    }

    const payload = await response.json();
    const text = payload?.content?.find((item) => item?.type === "text")?.text?.trim() || "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return Response.json({ analysis: fallbackAnalysis(entryText), source: "fallback" });
    }

    const triggered = parsed?.triggered || {};
    const safe = {
      triggered: {
        step1: Boolean(triggered.step1),
        step2: Boolean(triggered.step2),
        step3: Boolean(triggered.step3)
      },
      fact: String(parsed?.fact || ""),
      story: String(parsed?.story || ""),
      outsideControl: String(parsed?.outsideControl || ""),
      insideControl: String(parsed?.insideControl || ""),
      chosenResponse: String(parsed?.chosenResponse || ""),
      lesson: String(parsed?.lesson || "")
    };

    if (!safe.triggered.step1 && !safe.triggered.step2 && !safe.triggered.step3) {
      safe.triggered = detectSteps(entryText);
    }

    return Response.json({ analysis: safe, source: "ai" });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to analyze entry" }, { status: 500 });
  }
}
