import { requireAuthUserId } from "@/lib/require-auth";
import { appendProfileLocaleBlock } from "@/lib/ai-prompt-addendum";
import { detectStepsWithDefault as detectSteps } from "@/lib/trigger-steps";

function fallbackAnalysis(entryText) {
  return {
    triggered: detectSteps(entryText),
    fact: "",
    story: "",
    outsideControl: "",
    insideControl: "",
    chosenResponse: "",
    lesson: "",
    feeling: ""
  };
}

/**
 * Affect labeling (Lieberman et al., 2007) shows the strongest amygdala
 * dampening comes from a precise emotion *word*, not a phrase. Coerce the
 * model's `feeling` output to 1–2 lowercase words, strip punctuation, and
 * reject obvious non-labels.
 */
function sanitizeFeeling(raw) {
  const cleaned = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ").filter(Boolean).slice(0, 2);
  const result = words.join(" ");
  if (result.length > 32) return "";
  return result;
}

export async function POST(request) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;

  try {
    const body = await request.json();
    const entryText = String(body?.entryText || "").trim();
    const profileBlock = appendProfileLocaleBlock(String(body?.profile || "").trim());
    if (!entryText) {
      return Response.json({ error: "entryText is required" }, { status: 400 });
    }

    const rawKey = process.env.ANTHROPIC_API_KEY;
    const apiKey = typeof rawKey === "string" ? rawKey.trim() : "";
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
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 500,
        temperature: 0.4,
        system:
          "You are a resilience journaling coach. Return strict JSON only with keys: triggered, fact, story, outsideControl, insideControl, chosenResponse, lesson, feeling. triggered must be an object with booleans step1 step2 step3. Keep text concise, practical, and in casual everyday language. For `feeling`: ONE word, lowercase, naming the core emotion underneath what the user wrote (e.g. \"lonely\", \"scared\", \"ashamed\", \"frustrated\", \"hurt\", \"resentful\"). Two words ONLY when one word is genuinely inadequate. Never a phrase or sentence. Pick the most precise label, not the vaguest. If the entry is purely neutral/positive, return \"\".",
        messages: [
          {
            role: "user",
            content: [
              "Analyze this log entry and prefill journaling fields.",
              "Write naturally and casually (not formal).",
              profileBlock,
              entryText
            ]
              .filter(Boolean)
              .join("\n\n")
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
      lesson: String(parsed?.lesson || ""),
      feeling: sanitizeFeeling(parsed?.feeling)
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
