import { getClerkUserLabel } from "@/lib/clerk-display-name";
import { entryIdExistsInDiary, loadOwnerDiaryArray } from "@/lib/diary-sharing-access";
import { ensureDiarySharingTables, hasDatabaseConfig } from "@/lib/diary-sharing-db";
import { getDb } from "@/lib/db";
import { requireAuthUserId } from "@/lib/require-auth";

function noDbResponse() {
  return Response.json(
    { error: "Diary sharing requires a database (POSTGRES_URL / DATABASE_URL)." },
    { status: 503 }
  );
}

async function labelsForUserIds(userIds) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map();
  await Promise.all(
    unique.map(async (id) => {
      map.set(id, await getClerkUserLabel(id));
    })
  );
  return map;
}

/**
 * Owner-only: reactions on own diary entries from people they shared with.
 * Query: entryId (optional) — full detail for one entry; omit for summary list.
 * Query: limit (optional, default 200) — max distinct entries in summary mode.
 */
export async function GET(request) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId: ownerId } = authResult;

  if (!hasDatabaseConfig()) return noDbResponse();

  const url = new URL(request.url);
  const entryId = url.searchParams.get("entryId")?.trim() || "";
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(500, Math.max(1, Number.parseInt(limitRaw || "200", 10) || 200));

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);

    if (entryId) {
      const diary = await loadOwnerDiaryArray(db, ownerId);
      if (!entryIdExistsInDiary(diary, entryId)) {
        return Response.json({ error: "Entry not found" }, { status: 404 });
      }

      const likeRows = await db`
        SELECT viewer_user_id, created_at FROM diary_entry_likes
        WHERE owner_user_id = ${ownerId} AND entry_id = ${entryId}
        ORDER BY created_at ASC;
      `;
      const commentRows = await db`
        SELECT id, author_user_id, body, created_at FROM diary_entry_comments
        WHERE owner_user_id = ${ownerId} AND entry_id = ${entryId}
        ORDER BY created_at ASC;
      `;
      const userIds = [...likeRows.map((r) => r.viewer_user_id), ...commentRows.map((r) => r.author_user_id)];
      const labelMap = await labelsForUserIds(userIds);

      return Response.json({
        entryId,
        likeCount: likeRows.length,
        likes: likeRows.map((r) => ({
          viewerUserId: r.viewer_user_id,
          label: labelMap.get(r.viewer_user_id) ?? r.viewer_user_id
        })),
        comments: commentRows.map((r) => ({
          id: r.id,
          authorUserId: r.author_user_id,
          authorLabel: labelMap.get(r.author_user_id) ?? r.author_user_id,
          body: r.body,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
        }))
      });
    }

    const likeAgg = await db`
      SELECT entry_id, COUNT(*)::int AS n
      FROM diary_entry_likes
      WHERE owner_user_id = ${ownerId}
      GROUP BY entry_id
      ORDER BY entry_id
      LIMIT ${limit};
    `;
    const commentAgg = await db`
      SELECT entry_id, COUNT(*)::int AS n
      FROM diary_entry_comments
      WHERE owner_user_id = ${ownerId}
      GROUP BY entry_id
      ORDER BY entry_id
      LIMIT ${limit};
    `;
    const byEntry = new Map();
    for (const row of likeAgg) {
      byEntry.set(row.entry_id, { entryId: row.entry_id, likeCount: row.n, commentCount: 0 });
    }
    for (const row of commentAgg) {
      const prev = byEntry.get(row.entry_id);
      if (prev) {
        prev.commentCount = row.n;
      } else {
        byEntry.set(row.entry_id, { entryId: row.entry_id, likeCount: 0, commentCount: row.n });
      }
    }
    const entries = [...byEntry.values()].slice(0, limit);
    return Response.json({ entries });
  } catch (error) {
    console.error("GET /api/me/sharing/reactions failed", error);
    return Response.json({ error: "Failed to load reactions" }, { status: 500 });
  }
}
