import { randomBytes } from "node:crypto";

/** Ensure one stable invite token per owner (for QR / link). */
export async function ensureInviteToken(db, ownerUserId) {
  const rows = await db`
    SELECT token FROM diary_share_invite_tokens WHERE owner_user_id = ${ownerUserId} LIMIT 1
  `;
  if (rows.length > 0) return rows[0].token;
  const token = randomBytes(24).toString("hex");
  await db`
    INSERT INTO diary_share_invite_tokens (owner_user_id, token, created_at)
    VALUES (${ownerUserId}, ${token}, NOW())
  `;
  return token;
}

/** Invalidate old token (e.g. if link leaked). */
export async function rotateInviteToken(db, ownerUserId) {
  const token = randomBytes(24).toString("hex");
  await db`
    INSERT INTO diary_share_invite_tokens (owner_user_id, token, created_at)
    VALUES (${ownerUserId}, ${token}, NOW())
    ON CONFLICT (owner_user_id) DO UPDATE SET
      token = EXCLUDED.token,
      created_at = NOW();
  `;
  return token;
}
