import { requireAuthUserId } from "@/lib/require-auth";

const DEFAULT_REPO = "john-bacic/Resilience";

export async function GET() {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;

  const rawKey = process.env.ANTHROPIC_API_KEY;
  const anthropicConfigured = typeof rawKey === "string" && rawKey.trim().length > 0;

  try {
    const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/main`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return Response.json(
        { commit: null, repo, error: "Failed to fetch commit", anthropicConfigured },
        { status: 200 }
      );
    }

    const payload = await response.json();
    const sha = payload?.sha || null;
    const shortSha = sha ? sha.slice(0, 7) : null;
    const committedAt = payload?.commit?.committer?.date || null;
    const htmlUrl = payload?.html_url || null;

    return Response.json({
      commit: shortSha,
      sha,
      committedAt,
      url: htmlUrl,
      repo,
      anthropicConfigured
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { commit: null, error: "Version lookup failed", anthropicConfigured },
      { status: 200 }
    );
  }
}
