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

/** Delete a comment: author (viewer) or diary owner. */
export async function DELETE(_request, context) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId } = authResult;

  const params = await context.params;
  const ownerId = params?.ownerId;
  const entryId = params?.entryId;
  const commentId = params?.commentId;
  if (!ownerId || typeof ownerId !== "string" || !entryId || typeof entryId !== "string") {
    return Response.json({ error: "Missing owner or entry" }, { status: 400 });
  }
  if (!commentId || typeof commentId !== "string") {
    return Response.json({ error: "Missing comment id" }, { status: 400 });
  }
  if (!hasDatabaseConfig()) return noDbResponse();

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);

    const rows = await db`
      SELECT author_user_id FROM diary_entry_comments
      WHERE id = ${commentId} AND owner_user_id = ${ownerId} AND entry_id = ${entryId}
      LIMIT 1;
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const authorUserId = rows[0].author_user_id;

    const isOwner = userId === ownerId;
    const isAuthor = userId === authorUserId;
    if (isAuthor) {
      const diary = await loadOwnerDiaryArray(db, ownerId);
      if (!entryIdExistsInDiary(diary, entryId)) {
        return Response.json({ error: "Entry not found" }, { status: 404 });
      }
    } else if (isOwner) {
      // owner moderation — entry must exist
      const diary = await loadOwnerDiaryArray(db, ownerId);
      if (!entryIdExistsInDiary(diary, entryId)) {
        return Response.json({ error: "Entry not found" }, { status: 404 });
      }
    } else {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await db`
      DELETE FROM diary_entry_comments
      WHERE id = ${commentId} AND owner_user_id = ${ownerId} AND entry_id = ${entryId};
    `;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("DELETE shared comment failed", error);
    return Response.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
