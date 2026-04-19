import { defaultState } from "@/lib/default-state";

/**
 * @param {import("@neondatabase/serverless").NeonQueryFunction} db
 * @param {string} ownerId
 * @param {string} viewerId
 */
export async function viewerHasSharedAccess(db, ownerId, viewerId) {
  if (ownerId === viewerId) return false;
  const access = await db`
    SELECT 1 AS ok
    FROM diary_share_grants g
    INNER JOIN diary_share_settings s ON s.user_id = g.owner_user_id
    WHERE g.owner_user_id = ${ownerId}
      AND g.viewer_user_id = ${viewerId}
      AND s.enabled = true
    LIMIT 1;
  `;
  return access.length > 0;
}

/**
 * @param {import("@neondatabase/serverless").NeonQueryFunction} db
 * @param {string} ownerId
 * @returns {Promise<object[]>}
 */
export async function loadOwnerDiaryArray(db, ownerId) {
  const stateRows = await db`
    SELECT state FROM resilience_user_state WHERE user_id = ${ownerId} LIMIT 1;
  `;
  if (stateRows.length === 0) return [];
  const merged = { ...defaultState, ...stateRows[0].state };
  const diary = Array.isArray(merged.diary) ? merged.diary : [];
  return diary;
}

/**
 * @param {object[]} diary
 * @param {string} entryId
 */
export function entryIdExistsInDiary(diary, entryId) {
  if (!entryId || typeof entryId !== "string") return false;
  return diary.some((e) => e && typeof e === "object" && e.id === entryId);
}
