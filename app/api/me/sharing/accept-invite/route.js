import { ensureDiarySharingTables, hasDatabaseConfig } from "@/lib/diary-sharing-db";
import { getClerkUserLabel } from "@/lib/clerk-display-name";
import { getDb } from "@/lib/db";
import { requireAuthUserId } from "@/lib/require-auth";

function noDbResponse() {
  return Response.json(
    { error: "Diary sharing requires a database (POSTGRES_URL / DATABASE_URL)." },
    { status: 503 }
  );
}

/** Viewer accepts an invite: adds grant (owner → viewer) when token is valid and owner enabled sharing. */
export async function POST(request) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId: viewerId } = authResult;

  if (!hasDatabaseConfig()) return noDbResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const db = getDb();
    await ensureDiarySharingTables(db);

    const ownerRows = await db`
      SELECT t.owner_user_id
      FROM diary_share_invite_tokens t
      INNER JOIN diary_share_settings s ON s.user_id = t.owner_user_id
      WHERE t.token = ${token}
        AND s.enabled = true
      LIMIT 1;
    `;
    if (ownerRows.length === 0) {
      return Response.json({ error: "Invalid or expired invite link." }, { status: 404 });
    }

    const ownerId = ownerRows[0].owner_user_id;
    if (ownerId === viewerId) {
      return Response.json({ error: "That invite is for your own account." }, { status: 400 });
    }

    await db`
      INSERT INTO diary_share_grants (owner_user_id, viewer_user_id, created_at)
      VALUES (${ownerId}, ${viewerId}, NOW())
      ON CONFLICT (owner_user_id, viewer_user_id) DO NOTHING;
    `;

    const label = await getClerkUserLabel(ownerId);
    return Response.json({ ok: true, ownerId, label });
  } catch (error) {
    console.error("POST /api/me/sharing/accept-invite failed", error);
    return Response.json({ error: "Failed to accept invite" }, { status: 500 });
  }
}
