import { defaultState } from "@/lib/default-state";
import { ensureDiarySharingTables, hasDatabaseConfig } from "@/lib/diary-sharing-db";
import { getDb } from "@/lib/db";
import { requireAuthUserId } from "@/lib/require-auth";

function noDbResponse() {
  return Response.json(
    { error: "Diary sharing requires a database (POSTGRES_URL / DATABASE_URL)." },
    { status: 503 }
  );
}

/** Read-only diary entries for ownerId, only if current user is allowlisted and owner enabled sharing. */
export async function GET(_request, context) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId: viewerId } = authResult;

  const params = await context.params;
  const ownerId = params?.ownerId;
  if (!ownerId || typeof ownerId !== "string") {
    return Response.json({ error: "Missing owner id" }, { status: 400 });
  }
  if (ownerId === viewerId) {
    return Response.json({ error: "Use your own app state for your diary" }, { status: 400 });
  }

  if (!hasDatabaseConfig()) return noDbResponse();

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);

    const access = await db`
      SELECT 1 AS ok
      FROM diary_share_grants g
      INNER JOIN diary_share_settings s ON s.user_id = g.owner_user_id
      WHERE g.owner_user_id = ${ownerId}
        AND g.viewer_user_id = ${viewerId}
        AND s.enabled = true
      LIMIT 1;
    `;
    if (access.length === 0) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const stateRows = await db`
      SELECT state FROM resilience_user_state WHERE user_id = ${ownerId} LIMIT 1;
    `;
    if (stateRows.length === 0) {
      return Response.json({ diary: [], ownerId });
    }
    const merged = { ...defaultState, ...stateRows[0].state };
    const diary = Array.isArray(merged.diary) ? merged.diary : [];
    return Response.json({ diary, ownerId });
  } catch (error) {
    console.error("GET /api/shared-diaries/[ownerId] failed", error);
    return Response.json({ error: "Failed to load shared diary" }, { status: 500 });
  }
}
