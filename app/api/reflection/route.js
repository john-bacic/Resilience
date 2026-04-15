const emptyReflection = {
  facts: "",
  story: "",
  outsideControl: "",
  insideControl: "",
  chosenResponse: "",
  intention: ""
};

const genericPatterns = [
  /focus on what i can control/i,
  /i will stay calm/i,
  /take a deep breath/i,
  /control what i can/i,
  /let it go/i
];

function cleanJsonText(text) {
  return String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseReflection(text) {
  try {
    const parsed = JSON.parse(cleanJsonText(text));
    return {
      facts: String(parsed?.facts || ""),
      story: String(parsed?.story || ""),
      outsideControl: String(parsed?.outsideControl || ""),
      insideControl: String(parsed?.insideControl || ""),
      chosenResponse: String(parsed?.chosenResponse || ""),
      intention: String(parsed?.intention || "")
    };
  } catch {
    return null;
  }
}

function reflectionLooksGeneric(reflection) {
  const allText = Object.values(reflection).join(" ").trim();
  if (!allText) return true;
  if (allText.length < 80) return true;
  return genericPatterns.some((pattern) => pattern.test(allText));
}

async function generateReflection({
  apiKey,
  model,
  scenario,
  reaction,
  variationStyle,
  temperature,
  avoidText
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature,
      system:
        "You are a high-quality resilience journaling coach. Return strict JSON only with keys: facts, story, outsideControl, insideControl, chosenResponse, intention. Use first-person voice. Make each field specific to the scenario and reaction, concrete, and psychologically sharp. Avoid generic self-help cliches and repeated phrases.",
      messages: [
        {
          role: "user",
          content: `Fill this morning reflection.
Scenario: ${scenario}
Reaction: ${reaction}
Variation style: ${variationStyle}

Rules:
- facts: concrete observable events only.
- story: likely interpretation bias in one concise sentence.
- outsideControl: specific elements I cannot control.
- insideControl: specific controllable actions/choices.
- chosenResponse: one realistic behavior I will do next.
- intention: one short personal mantra for today.
- Keep each field distinct; do not repeat wording across fields.
- Use vivid language and avoid bland phrases.
${avoidText ? `Avoid repeating these phrases: ${avoidText}` : ""}

Return JSON only.`
        }
      ]
    })
  });

  if (!response.ok) return null;
  const payload = await response.json();
  const text = payload?.content?.find((item) => item?.type === "text")?.text || "";
  return parseReflection(text);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const reaction = String(body?.reaction || "").trim();
    const scenario = String(body?.scenario || "").trim();

    if (!reaction) {
      return Response.json({ error: "reaction is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({
        reflection: emptyReflection,
        source: "fallback"
      });
    }

    const model = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";
    const stylePool = [
      "calm and grounded",
      "direct and no-nonsense",
      "compassionate but firm",
      "tactical and action-first",
      "stoic and pragmatic"
    ];
    const variationStyle = stylePool[Math.floor(Math.random() * stylePool.length)];

    const firstTry = await generateReflection({
      apiKey,
      model,
      scenario,
      reaction,
      variationStyle,
      temperature: 0.65,
      avoidText: ""
    });

    let finalReflection = firstTry;
    if (!finalReflection || reflectionLooksGeneric(finalReflection)) {
      const avoidText = finalReflection ? Object.values(finalReflection).join(" | ") : "";
      const secondTry = await generateReflection({
        apiKey,
        model,
        scenario,
        reaction,
        variationStyle: "more specific and less repetitive",
        temperature: 0.9,
        avoidText
      });
      finalReflection = secondTry || finalReflection;
    }

    if (!finalReflection) {
      return Response.json({
        reflection: emptyReflection,
        source: "fallback"
      });
    }

    return Response.json({
      reflection: finalReflection,
      source: "ai"
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to prefill reflection" }, { status: 500 });
  }
}
