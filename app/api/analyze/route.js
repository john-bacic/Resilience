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
    feeling: "",
    feelingOptions: [],
    resetActions: []
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

/**
 * The picker UX shows ~6 nearby affect labels so the user can pick the one
 * that resonates most (Lieberman et al., 2007 — the labeling has to be the
 * *user's* choice). Sanitize each candidate the same way as `feeling`,
 * dedupe, and cap at 6.
 */
/**
 * `resetActions` is rendered as a row of cards in the log ceremony. Each entry
 * must be a short {title, howTo} pair. Keep title 2–5 words, howTo to a single
 * sentence, and drop anything malformed. Cap the list at 3.
 */
function sanitizeResetActions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const title = String(item.title || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
    const howTo = String(item.howTo || item.how || item.instructions || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    if (!title || !howTo) continue;
    out.push({ title, howTo });
    if (out.length >= 3) break;
  }
  return out;
}

function sanitizeFeelingOptions(raw, primary) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  const primaryClean = sanitizeFeeling(primary);
  if (primaryClean) {
    seen.add(primaryClean);
    out.push(primaryClean);
  }
  for (const item of list) {
    const clean = sanitizeFeeling(item);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 6) break;
  }
  return out;
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
        max_tokens: 1200,
        temperature: 0.4,
        system:
          "You are a resilience journaling coach. Return strict JSON only with keys: triggered, fact, story, outsideControl, insideControl, chosenResponse, lesson, feeling, feelingOptions, resetActions. triggered must be an object with booleans step1 step2 step3. Keep text concise, practical, and in casual everyday language. For `feeling`: ONE word, lowercase, naming the core emotion underneath what the user wrote (e.g. \"lonely\", \"scared\", \"ashamed\", \"frustrated\", \"hurt\", \"resentful\"). Two words ONLY when one word is genuinely inadequate. Never a phrase or sentence. Pick the most precise label, not the vaguest. If the entry is purely neutral/positive, return \"\". For `feelingOptions`: an array of 5–6 distinct lowercase one-word emotion labels in the same affective vicinity as `feeling`, so the user can pick the one that resonates. Include `feeling` as the first item. Vary precision and shade (e.g. for `lonely`: [\"lonely\", \"isolated\", \"abandoned\", \"unseen\", \"left out\", \"disconnected\"]; for `frustrated`: [\"frustrated\", \"annoyed\", \"powerless\", \"thwarted\", \"resentful\", \"impatient\"]). Avoid near-synonyms that feel identical; each option should give the user a meaningfully different angle. If `feeling` is \"\", return an empty array. For `resetActions`: an array of EXACTLY 3 short physical/somatic moves the user can do right now (each <2 minutes, mostly anywhere) to take the edge off the feeling. Each item is an object {title, howTo}. Title is 2–5 words in sentence case (e.g. \"Physiological sigh\", \"Splash cold water\", \"Push against a wall\", \"60-second power posture\"). howTo is ONE concrete sentence with a duration, count, or rep (e.g. \"Double inhale through your nose, then one long exhale through your mouth. Five rounds.\"). Lean on evidence-backed regulation: physiological sigh, dive reflex (cold water/ice on face), vagal toning (long exhales, humming, gargling), bilateral movement (brisk walk, butterfly tap), grounding (5-4-3-2-1 senses, hold ice), expansive posture, hand-on-heart self-touch, isometric push for anger, sunlight exposure for low mood. Match the SPECIFIC feeling: anger/resentful → isometric push or vigorous walk; anxious/scared → physiological sigh, cold water, long exhales; sad/lonely → sunlight, self-touch, gentle movement; ashamed/embarrassed → power posture, cold water, humming; numb/disconnected → high-arousal (jumping jacks, ice, cold shower); hurt → hand-on-heart, slow box breath, bilateral tap. Use the entry context (at work, alone, in public, in bed) to keep suggestions plausible — don't suggest jumping jacks in a meeting. Never suggest journaling, \"be gentle with yourself\", substances, food, screens, or \"talk to someone/a therapist\". If `feeling` is \"\", return an empty array.",
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
      const errBody = await response.text().catch(() => "");
      console.error("[analyze] Anthropic HTTP", response.status, errBody.slice(0, 400));
      return Response.json({ analysis: fallbackAnalysis(entryText), source: "fallback" });
    }

    const payload = await response.json();
    const text = payload?.content?.find((item) => item?.type === "text")?.text?.trim() || "";
    if (payload?.stop_reason === "max_tokens") {
      console.error("[analyze] Anthropic truncated output (max_tokens); len=", text.length);
    }
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[analyze] JSON parse failed; stop_reason=", payload?.stop_reason, "len=", cleaned.length);
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
      feeling: sanitizeFeeling(parsed?.feeling),
      feelingOptions: sanitizeFeelingOptions(parsed?.feelingOptions, parsed?.feeling),
      resetActions: sanitizeResetActions(parsed?.resetActions)
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
