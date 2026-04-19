/** Pattern lists shared with /api/analyze and Progress stats. */

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

function scorePatterns(normalized, patterns) {
  return patterns.reduce((total, pattern) => total + (normalized.includes(pattern) ? 1 : 0), 0);
}

/** Same behavior as legacy analyze fallback: default to step1 when nothing matches. */
export function detectStepsWithDefault(text) {
  const normalized = String(text || "").toLowerCase();
  const step1 = scorePatterns(normalized, step1Patterns) > 0;
  const step2 = scorePatterns(normalized, step2Patterns) > 0;
  const step3 = scorePatterns(normalized, step3Patterns) > 0;
  if (!step1 && !step2 && !step3) {
    return { step1: true, step2: false, step3: false };
  }
  return { step1, step2, step3 };
}

/**
 * Strict detection for aggregate stats: no default step — if nothing matches, all false.
 */
export function detectStepsStrict(text) {
  const normalized = String(text || "").toLowerCase();
  const step1 = scorePatterns(normalized, step1Patterns) > 0;
  const step2 = scorePatterns(normalized, step2Patterns) > 0;
  const step3 = scorePatterns(normalized, step3Patterns) > 0;
  if (!step1 && !step2 && !step3) {
    return { step1: false, step2: false, step3: false };
  }
  return { step1, step2, step3 };
}

export function stepIdsFromFlags(flags) {
  const ids = [];
  if (flags.step1) ids.push("step1");
  if (flags.step2) ids.push("step2");
  if (flags.step3) ids.push("step3");
  return ids;
}

export const STEP_LABELS = {
  step1: "Facts vs Story",
  step2: "Control filter",
  step3: "Chosen response"
};
