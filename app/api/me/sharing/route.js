import { ensureDiarySharingTables, hasDatabaseConfig } from "@/lib/diary-sharing-db";
import { getDb } from "@/lib/db";
import { requireAuthUserId } from "@/lib/require-auth";

function noDbResponse() {
  return Response.json(
    { error: "Diary sharing requires a database (POSTGRES_URL / DATABASE_URL)." },
    { status: 503 }
  );
}

/** Owner sharing settings + list of viewer user ids this owner has granted. */
export async function GET() {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId } = authResult;

  if (!hasDatabaseConfig()) return noDbResponse();

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);
    const settingsRows = await db`
      SELECT enabled FROM diary_share_settings WHERE user_id = ${userId} LIMIT 1;
    `;
    const enabled = settingsRows.length > 0 ? Boolean(settingsRows[0].enabled) : false;
    const grantRows = await db`
      SELECT viewer_user_id FROM diary_share_grants WHERE owner_user_id = ${userId} ORDER BY created_at ASC;
    `;
    const grantedTo = grantRows.map((r) => r.viewer_user_id);
    return Response.json({ enabled, grantedTo });
  } catch (error) {
    console.error("GET /api/me/sharing failed", error);
    return Response.json({ error: "Failed to load sharing settings" }, { status: 500 });
  }
}

/**
 * Body: { enabled?: boolean, grantUserId?: string, revokeUserId?: string }
 * — diary is shareable only when enabled; grants allow those viewers read-only access.
 */
export async function PATCH(request) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId } = authResult;

  if (!hasDatabaseConfig()) return noDbResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const enabled = body?.enabled;
  const grantUserId = typeof body?.grantUserId === "string" ? body.grantUserId.trim() : "";
  const revokeUserId = typeof body?.revokeUserId === "string" ? body.revokeUserId.trim() : "";

  if (enabled !== undefined && typeof enabled !== "boolean") {
    return Response.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);

    if (enabled !== undefined) {
      await db`
        INSERT INTO diary_share_settings (user_id, enabled, updated_at)
        VALUES (${userId}, ${enabled}, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET enabled = EXCLUDED.enabled,
            updated_at = NOW();
      `;
    }

    if (grantUserId) {
      if (grantUserId === userId) {
        return Response.json({ error: "Cannot grant access to yourself" }, { status: 400 });
      }
      await db`
        INSERT INTO diary_share_grants (owner_user_id, viewer_user_id, created_at)
        VALUES (${userId}, ${grantUserId}, NOW())
        ON CONFLICT (owner_user_id, viewer_user_id) DO NOTHING;
      `;
    }

    if (revokeUserId) {
      await db`
        DELETE FROM diary_share_grants
        WHERE owner_user_id = ${userId} AND viewer_user_id = ${revokeUserId};
      `;
    }

    const settingsRows = await db`
      SELECT enabled FROM diary_share_settings WHERE user_id = ${userId} LIMIT 1;
    `;
    const outEnabled = settingsRows.length > 0 ? Boolean(settingsRows[0].enabled) : false;
    const grantRows = await db`
      SELECT viewer_user_id FROM diary_share_grants WHERE owner_user_id = ${userId} ORDER BY created_at ASC;
    `;
    const grantedTo = grantRows.map((r) => r.viewer_user_id);

    return Response.json({ enabled: outEnabled, grantedTo });
  } catch (error) {
    console.error("PATCH /api/me/sharing failed", error);
    return Response.json({ error: "Failed to update sharing settings" }, { status: 500 });
  }
}
