import { requireAuthUserId } from "@/lib/require-auth";

/**
 * GET — whether the server runtime sees an Anthropic key (boolean only; never the secret).
 * Use while signed in: DevTools → Network, or `fetch("/api/ai-status").then(r => r.json())`.
 */
export async function GET() {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;

  const raw = process.env.ANTHROPIC_API_KEY;
  const key = typeof raw === "string" ? raw.trim() : "";
  return Response.json({
    anthropicKeyConfigured: key.length > 0,
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001"
  });
}
