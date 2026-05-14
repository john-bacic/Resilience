/**
 * When the user's About-you profile includes country/nationality, Anthropic
 * prompts should not default to U.S.-only institutions (e.g. "DMV" for Canada).
 */
export const PROFILE_LOCALE_INSTRUCTION =
  "When Country or Nationality is given, use realistic institutions and everyday references for that place (e.g. Canada: provincial registry / ServiceOntario-style services, not U.S. \"DMV\" unless the profile clearly places the user in the United States). Do not assume U.S.-only bureaucracy by default.";

/**
 * @param {string} profileTrimmed — output of profileToScenarioContext (pipe-separated facts)
 */
export function appendProfileLocaleBlock(profileTrimmed) {
  const p = String(profileTrimmed || "").trim();
  if (!p) return "";
  return `\n\nAbout this person (treat as true; use for realistic place-appropriate references only):\n${p}\n\n${PROFILE_LOCALE_INSTRUCTION}`;
}
