import { defaultState } from "@/lib/default-state";
import { getDb } from "@/lib/db";

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
    console.error(error);
    return Response.json({ error: "Failed to fetch app state" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const db = getDb();
    const body = await request.json();
    const state = body?.state;
    if (!state || typeof state !== "object") {
      return Response.json({ error: "Invalid state payload" }, { status: 400 });
    }
    const safeState = { ...defaultState, ...state };
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
