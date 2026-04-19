import { getClerkUserLabel } from "@/lib/clerk-display-name";
import { findUserIdByEmail } from "@/lib/clerk-find-user-by-email";
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
      SELECT enabled, share_display_name FROM diary_share_settings WHERE user_id = ${userId} LIMIT 1;
    `;
    const enabled = settingsRows.length > 0 ? Boolean(settingsRows[0].enabled) : false;
    const shareDisplayName =
      settingsRows.length > 0 ? String(settingsRows[0].share_display_name ?? "").trim() : "";
    const grantRows = await db`
      SELECT viewer_user_id FROM diary_share_grants WHERE owner_user_id = ${userId} ORDER BY created_at ASC;
    `;
    const grantedTo = grantRows.map((r) => r.viewer_user_id);
    const grants = await Promise.all(
      grantedTo.map(async (viewerUserId) => ({
        userId: viewerUserId,
        label: await getClerkUserLabel(viewerUserId)
      }))
    );
    return Response.json({ enabled, shareDisplayName, grantedTo, grants });
  } catch (error) {
    console.error("GET /api/me/sharing failed", error);
    return Response.json({ error: "Failed to load sharing settings" }, { status: 500 });
  }
}

/**
 * Body: { enabled?: boolean, shareDisplayName?: string, grantUserId?: string, grantEmail?: string, revokeUserId?: string }
 * — shareDisplayName: how this owner appears in others’ shared-diary lists (max 80 chars).
 * — grantEmail looks up the viewer in Clerk by email; grantUserId is optional fallback (e.g. support).
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
  const grantUserIdRaw = typeof body?.grantUserId === "string" ? body.grantUserId.trim() : "";
  const grantEmailRaw = typeof body?.grantEmail === "string" ? body.grantEmail.trim() : "";
  const revokeUserId = typeof body?.revokeUserId === "string" ? body.revokeUserId.trim() : "";

  let shareDisplayNameUpdate;
  if (body?.shareDisplayName !== undefined) {
    if (typeof body.shareDisplayName !== "string") {
      return Response.json({ error: "shareDisplayName must be a string" }, { status: 400 });
    }
    const trimmed = body.shareDisplayName.trim();
    if (trimmed.length > 80) {
      return Response.json({ error: "Display name must be 80 characters or less" }, { status: 400 });
    }
    shareDisplayNameUpdate = trimmed;
  }

  if (enabled !== undefined && typeof enabled !== "boolean") {
    return Response.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);

    if (shareDisplayNameUpdate !== undefined) {
      await db`
        INSERT INTO diary_share_settings (user_id, enabled, share_display_name, updated_at)
        VALUES (${userId}, false, ${shareDisplayNameUpdate}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          share_display_name = EXCLUDED.share_display_name,
          updated_at = NOW();
      `;
    }

    if (enabled !== undefined) {
      await db`
        INSERT INTO diary_share_settings (user_id, enabled, updated_at)
        VALUES (${userId}, ${enabled}, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET enabled = EXCLUDED.enabled,
            updated_at = NOW();
      `;
    }

    let grantTargetId = "";
    if (grantEmailRaw) {
      const found = await findUserIdByEmail(grantEmailRaw);
      if (!found.ok) {
        return Response.json({ error: found.error }, { status: 400 });
      }
      grantTargetId = found.userId;
    } else if (grantUserIdRaw) {
      grantTargetId = grantUserIdRaw;
    }

    if (grantTargetId) {
      if (grantTargetId === userId) {
        return Response.json({ error: "Cannot grant access to yourself" }, { status: 400 });
      }
      await db`
        INSERT INTO diary_share_grants (owner_user_id, viewer_user_id, created_at)
        VALUES (${userId}, ${grantTargetId}, NOW())
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
      SELECT enabled, share_display_name FROM diary_share_settings WHERE user_id = ${userId} LIMIT 1;
    `;
    const outEnabled = settingsRows.length > 0 ? Boolean(settingsRows[0].enabled) : false;
    const outShareDisplayName =
      settingsRows.length > 0 ? String(settingsRows[0].share_display_name ?? "").trim() : "";
    const grantRows = await db`
      SELECT viewer_user_id FROM diary_share_grants WHERE owner_user_id = ${userId} ORDER BY created_at ASC;
    `;
    const grantedTo = grantRows.map((r) => r.viewer_user_id);
    const grants = await Promise.all(
      grantedTo.map(async (viewerUserId) => ({
        userId: viewerUserId,
        label: await getClerkUserLabel(viewerUserId)
      }))
    );

    return Response.json({
      enabled: outEnabled,
      shareDisplayName: outShareDisplayName,
      grantedTo,
      grants
    });
  } catch (error) {
    console.error("PATCH /api/me/sharing failed", error);
    return Response.json({ error: "Failed to update sharing settings" }, { status: 500 });
  }
}
