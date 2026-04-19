import { getClerkUserLabel } from "@/lib/clerk-display-name";
import { ensureDiarySharingTables, hasDatabaseConfig } from "@/lib/diary-sharing-db";
import { getDb } from "@/lib/db";
import { requireAuthUserId } from "@/lib/require-auth";

function noDbResponse() {
  return Response.json(
    { error: "Diary sharing requires a database (POSTGRES_URL / DATABASE_URL)." },
    { status: 503 }
  );
}

/** Owners who enabled sharing and granted the current user read access (diary only). */
export async function GET() {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId } = authResult;

  if (!hasDatabaseConfig()) return noDbResponse();

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);
    const rows = await db`
      SELECT g.owner_user_id, s.share_display_name
      FROM diary_share_grants g
      INNER JOIN diary_share_settings s ON s.user_id = g.owner_user_id
      WHERE g.viewer_user_id = ${userId}
        AND s.enabled = true
      ORDER BY g.created_at ASC;
    `;
    const items = await Promise.all(
      rows.map(async (r) => {
        const ownerId = r.owner_user_id;
        const custom = String(r.share_display_name ?? "").trim();
        const label = custom || (await getClerkUserLabel(ownerId));
        return { ownerId, label };
      })
    );
    return Response.json({ items });
  } catch (error) {
    console.error("GET /api/shared-diaries failed", error);
    return Response.json({ error: "Failed to list shared diaries" }, { status: 500 });
  }
}
