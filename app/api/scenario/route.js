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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const day = Math.max(1, Number(searchParams.get("day")) || 1);
  const avoid = String(searchParams.get("avoid") || "").trim();
  const fallback = fallbackForDay(day);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ scenario: fallback, source: "fallback" });
  }

  try {
    const styleVariants = [
      "social friction",
      "work pressure",
      "logistical chaos",
      "relationship ambiguity",
      "self-doubt moment",
      "public awkwardness",
      "time-pressure conflict",
      "miscommunication tension"
    ];
    const style = styleVariants[Math.floor(Math.random() * styleVariants.length)];

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
          "You create short, realistic, non-catastrophic negative scenarios for resilience training. Return exactly one plain sentence, no quotes, no numbering. The sentence must be in future tense (e.g., using 'will').",
        messages: [
          {
            role: "user",
            content: `Generate one daily negative scenario for Day ${day} in a 30-day resilience practice.
Style: ${style}.
Keep it under 18 words.
Make it concrete and vivid, not generic.
Use clear future tense only.
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
      return Response.json({ scenario: fallbackForDay(day + 1), source: "fallback" });
    }

    const normalizedScenario = /\bwill\b/i.test(scenario) ? scenario : `You will ${scenario.charAt(0).toLowerCase()}${scenario.slice(1)}`;

    return Response.json({ scenario: normalizedScenario, source: "ai" });
  } catch (error) {
    console.error(error);
    return Response.json({ scenario: fallback, source: "fallback" });
  }
}
