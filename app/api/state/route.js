import { defaultState } from "@/lib/default-state";
import { getDb } from "@/lib/db";
import { ensureUserStateTable } from "@/lib/diary-sharing-db";
import { requireAuthUserId } from "@/lib/require-auth";

/** @type {Map<string, object>} */
const memoryByUser = new Map();

function hasDatabaseConfig() {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

function getMemoryState(userId) {
  if (!memoryByUser.has(userId)) {
    memoryByUser.set(userId, JSON.parse(JSON.stringify(defaultState)));
  }
  return memoryByUser.get(userId);
}

export async function GET() {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId } = authResult;

  if (!hasDatabaseConfig()) {
    return Response.json({ state: getMemoryState(userId), source: "memory" });
  }

  try {
    const db = getDb();
    await ensureUserStateTable(db);
    const rows = await db`
      SELECT state FROM resilience_user_state WHERE user_id = ${userId} LIMIT 1;
    `;
    if (rows.length === 0) {
      await db`
        INSERT INTO resilience_user_state (user_id, state, updated_at)
        VALUES (${userId}, ${JSON.stringify(defaultState)}::jsonb, NOW())
        ON CONFLICT (user_id) DO NOTHING;
      `;
      return Response.json({ state: defaultState });
    }
    return Response.json({ state: { ...defaultState, ...rows[0].state } });
  } catch (error) {
    console.error("GET /api/state failed, using default state", error);
    return Response.json(
      { state: { ...defaultState }, source: "fallback", degraded: true },
      { status: 200 }
    );
  }
}

export async function PUT(request) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId } = authResult;

  const body = await request.json();
  const state = body?.state;
  if (!state || typeof state !== "object") {
    return Response.json({ error: "Invalid state payload" }, { status: 400 });
  }
  const safeState = { ...defaultState, ...state };

  if (!hasDatabaseConfig()) {
    memoryByUser.set(userId, safeState);
    return Response.json({ state: safeState, source: "memory" });
  }

  try {
    const db = getDb();
    await ensureUserStateTable(db);
    await db`
      INSERT INTO resilience_user_state (user_id, state, updated_at)
      VALUES (${userId}, ${JSON.stringify(safeState)}::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET state = EXCLUDED.state,
          updated_at = NOW();
    `;
    return Response.json({ state: safeState });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to save app state" }, { status: 500 });
  }
}
