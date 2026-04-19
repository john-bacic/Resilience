import { getClerkUserLabel } from "@/lib/clerk-display-name";
import {
  entryIdExistsInDiary,
  loadOwnerDiaryArray,
  viewerHasSharedAccess
} from "@/lib/diary-sharing-access";
import { ensureDiarySharingTables, hasDatabaseConfig } from "@/lib/diary-sharing-db";
import { getDb } from "@/lib/db";
import { requireAuthUserId } from "@/lib/require-auth";

const MAX_COMMENT_LEN = 2000;

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

/** @param {import("@neondatabase/serverless").NeonQueryFunction} db */
async function fetchReactionsPayload(db, ownerId, entryId, viewerId) {
  const likeRows = await db`
    SELECT viewer_user_id FROM diary_entry_likes
    WHERE owner_user_id = ${ownerId} AND entry_id = ${entryId}
    ORDER BY created_at ASC;
  `;
  const commentRows = await db`
    SELECT id, author_user_id, body, created_at FROM diary_entry_comments
    WHERE owner_user_id = ${ownerId} AND entry_id = ${entryId}
    ORDER BY created_at ASC;
  `;
  const likedByMe = likeRows.some((r) => r.viewer_user_id === viewerId);
  const userIds = [
    ...likeRows.map((r) => r.viewer_user_id),
    ...commentRows.map((r) => r.author_user_id)
  ];
  const labelMap = await labelsForUserIds(userIds);
  return {
    likeCount: likeRows.length,
    likedByMe,
    comments: commentRows.map((r) => ({
      id: r.id,
      authorUserId: r.author_user_id,
      authorLabel: labelMap.get(r.author_user_id) ?? r.author_user_id,
      body: r.body,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
    }))
  };
}

/** GET: viewer with shared access — like/comment summary. POST: toggleLike | comment */
export async function GET(_request, context) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId: viewerId } = authResult;

  const params = await context.params;
  const ownerId = params?.ownerId;
  const entryId = params?.entryId;
  if (!ownerId || typeof ownerId !== "string" || !entryId || typeof entryId !== "string") {
    return Response.json({ error: "Missing owner or entry" }, { status: 400 });
  }
  if (ownerId === viewerId) {
    return Response.json({ error: "Use owner reactions API for your own diary" }, { status: 400 });
  }
  if (!hasDatabaseConfig()) return noDbResponse();

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);
    const ok = await viewerHasSharedAccess(db, ownerId, viewerId);
    if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });

    const diary = await loadOwnerDiaryArray(db, ownerId);
    if (!entryIdExistsInDiary(diary, entryId)) {
      return Response.json({ error: "Entry not found" }, { status: 404 });
    }

    const payload = await fetchReactionsPayload(db, ownerId, entryId, viewerId);
    return Response.json(payload);
  } catch (error) {
    console.error("GET shared reactions failed", error);
    return Response.json({ error: "Failed to load reactions" }, { status: 500 });
  }
}

export async function POST(request, context) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId: viewerId } = authResult;

  const params = await context.params;
  const ownerId = params?.ownerId;
  const entryId = params?.entryId;
  if (!ownerId || typeof ownerId !== "string" || !entryId || typeof entryId !== "string") {
    return Response.json({ error: "Missing owner or entry" }, { status: 400 });
  }
  if (ownerId === viewerId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!hasDatabaseConfig()) return noDbResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body?.action;

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);
    const ok = await viewerHasSharedAccess(db, ownerId, viewerId);
    if (!ok) return Response.json({ error: "Forbidden" }, { status: 403 });

    const diary = await loadOwnerDiaryArray(db, ownerId);
    if (!entryIdExistsInDiary(diary, entryId)) {
      return Response.json({ error: "Entry not found" }, { status: 404 });
    }

    if (action === "toggleLike") {
      const existing = await db`
        SELECT 1 FROM diary_entry_likes
        WHERE owner_user_id = ${ownerId} AND entry_id = ${entryId} AND viewer_user_id = ${viewerId}
        LIMIT 1;
      `;
      if (existing.length > 0) {
        await db`
          DELETE FROM diary_entry_likes
          WHERE owner_user_id = ${ownerId} AND entry_id = ${entryId} AND viewer_user_id = ${viewerId};
        `;
      } else {
        await db`
          INSERT INTO diary_entry_likes (owner_user_id, entry_id, viewer_user_id)
          VALUES (${ownerId}, ${entryId}, ${viewerId});
        `;
      }
      const payload = await fetchReactionsPayload(db, ownerId, entryId, viewerId);
      return Response.json(payload);
    }

    if (action === "comment") {
      const text = typeof body?.body === "string" ? body.body.trim() : "";
      if (!text) return Response.json({ error: "Comment cannot be empty" }, { status: 400 });
      if (text.length > MAX_COMMENT_LEN) {
        return Response.json({ error: `Comment too long (max ${MAX_COMMENT_LEN})` }, { status: 400 });
      }
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `c-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      await db`
        INSERT INTO diary_entry_comments (id, owner_user_id, entry_id, author_user_id, body)
        VALUES (${id}, ${ownerId}, ${entryId}, ${viewerId}, ${text});
      `;
      const payload = await fetchReactionsPayload(db, ownerId, entryId, viewerId);
      return Response.json(payload);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST shared reactions failed", error);
    return Response.json({ error: "Failed to update reactions" }, { status: 500 });
  }
}
