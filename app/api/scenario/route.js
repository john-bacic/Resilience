const FALLBACK_SCENARIOS = [
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
  "A conversation ends without the validation you hoped for."
];

function fallbackForDay(day) {
  return FALLBACK_SCENARIOS[(day - 1) % FALLBACK_SCENARIOS.length];
}

const STYLE_VARIANTS = [
  { style: "social friction", category: "social" },
  { style: "family conflict", category: "family" },
  { style: "parent or relative emergency", category: "family" },
  { style: "financial stress", category: "financial" },
  { style: "health scare", category: "health" },
  { style: "neighborhood safety concern", category: "community" },
  { style: "government or legal bureaucracy issue", category: "civic" },
  { style: "public transit or infrastructure failure", category: "infrastructure" },
  { style: "weather or environment disruption", category: "environment" },
  { style: "logistical chaos", category: "logistics" },
  { style: "relationship ambiguity", category: "social" },
  { style: "self-doubt moment", category: "internal" },
  { style: "public awkwardness", category: "social" },
  { style: "ridiculous-but-stressful mishap", category: "absurd" },
  { style: "darkly funny inconvenience spiral", category: "absurd" },
  { style: "time-pressure conflict", category: "work" },
  { style: "miscommunication tension", category: "social" },
  { style: "work pressure", category: "work" }
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const day = Math.max(1, Number(searchParams.get("day")) || 1);
  const avoid = String(searchParams.get("avoid") || "").trim();
  const avoidCategory = String(searchParams.get("avoidCategory") || "").trim().toLowerCase();
  const fallback = fallbackForDay(day);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ scenario: fallback, source: "fallback" });
  }

  try {
    const weightedPool = STYLE_VARIANTS.flatMap((variant) => {
      const weight = variant.category === "work" ? 1 : 3;
      return Array.from({ length: weight }, () => variant);
    });
    const allowedPool = weightedPool.filter((variant) => variant.category !== avoidCategory);
    const finalPool = allowedPool.length > 0 ? allowedPool : weightedPool;
    const picked = finalPool[Math.floor(Math.random() * finalPool.length)];
    const style = picked.style;
    const pickedCategory = picked.category;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307",
        max_tokens: 80,
        temperature: 1,
        system:
          "You write short negative scenarios for resilience training in casual everyday language. Scenario intensity can range from everyday stress to serious disruption, including personal, family, civic, and environmental situations. Occasionally include absurd, darkly funny, or ridiculous mishaps, but still make them emotionally inconvenient/negative and believable enough to reflect on. Avoid graphic violence or gore. Return exactly one plain sentence, no quotes, no numbering. The sentence must be in future tense (e.g., using 'will').",
        messages: [
          {
            role: "user",
            content: `Generate one daily negative scenario for Day ${day} in a 30-day resilience practice.
Style: ${style}.
Keep it under 18 words.
Make it concrete and vivid, not generic.
Use clear future tense only.
Use informal, conversational wording (not formal or clinical).
Not always work-related; rotate among personal life, parents/relatives, community/government systems, and broader life disruptions.
Sometimes make it weirdly funny or ridiculous, but still clearly negative.
${avoid ? `Do NOT repeat or paraphrase this scenario: "${avoid}".` : ""}
Return one sentence only.`
          }
        ]
      })
    });

    if (!response.ok) {
      return Response.json({ scenario: fallback, source: "fallback" });
    }

    const payload = await response.json();
    const scenario =
      payload?.content?.find((item) => item?.type === "text")?.text?.trim() ||
      payload?.content?.[0]?.text?.trim();
    if (!scenario) {
      return Response.json({ scenario: fallback, source: "fallback" });
    }

    if (avoid && scenario.toLowerCase() === avoid.toLowerCase()) {
      return Response.json({
        scenario: fallbackForDay(day + 1),
        source: "fallback",
        category: "fallback"
      });
    }

    const normalizedScenario = /\bwill\b/i.test(scenario) ? scenario : `You will ${scenario.charAt(0).toLowerCase()}${scenario.slice(1)}`;

    return Response.json({ scenario: normalizedScenario, source: "ai", category: pickedCategory });
  } catch (error) {
    console.error(error);
    return Response.json({ scenario: fallback, source: "fallback", category: "fallback" });
  }
}
