import { defaultState } from "@/lib/default-state";
import { getDb } from "@/lib/db";

let inMemoryState = { ...defaultState };

function hasDatabaseConfig() {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

async function ensureStateTable() {
  const db = getDb();
  await db`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
}

export async function GET() {
  if (!hasDatabaseConfig()) {
    return Response.json({ state: inMemoryState, source: "memory" });
  }

  try {
    const db = getDb();
    await ensureStateTable();
    const rows = await db`SELECT state FROM app_state WHERE id = 1 LIMIT 1;`;
    if (rows.length === 0) {
      await db`
        INSERT INTO app_state (id, state, updated_at)
        VALUES (1, ${JSON.stringify(defaultState)}::jsonb, NOW())
        ON CONFLICT (id) DO NOTHING;
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
  const body = await request.json();
  const state = body?.state;
  if (!state || typeof state !== "object") {
    return Response.json({ error: "Invalid state payload" }, { status: 400 });
  }
  const safeState = { ...defaultState, ...state };

  if (!hasDatabaseConfig()) {
    inMemoryState = safeState;
    return Response.json({ state: safeState, source: "memory" });
  }

  try {
    const db = getDb();
    await ensureStateTable();
    await db`
      INSERT INTO app_state (id, state, updated_at)
      VALUES (1, ${JSON.stringify(safeState)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
      SET state = EXCLUDED.state,
          updated_at = NOW();
    `;
    return Response.json({ state: safeState });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to save app state" }, { status: 500 });
  }
}
