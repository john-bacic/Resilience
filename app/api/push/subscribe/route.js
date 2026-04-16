import { getDb } from "@/lib/db";
import { requireAuthUserId } from "@/lib/require-auth";

async function ensurePushTable(db) {
  await db`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await db`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id TEXT;`;
}

function hasDatabaseConfig() {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

export async function POST(request) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId } = authResult;

  try {
    const body = await request.json();
    const subscription = body?.subscription;
    const endpoint = subscription?.endpoint;
    if (!endpoint) {
      return Response.json({ error: "Invalid subscription payload" }, { status: 400 });
    }

    if (!hasDatabaseConfig()) {
      return Response.json({ ok: true, source: "memory" });
    }

    const db = getDb();
    await ensurePushTable(db);
    await db`
      INSERT INTO push_subscriptions (endpoint, user_id, subscription, created_at)
      VALUES (${endpoint}, ${userId}, ${JSON.stringify(subscription)}::jsonb, NOW())
      ON CONFLICT (endpoint) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          subscription = EXCLUDED.subscription,
          created_at = NOW();
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to save push subscription" }, { status: 500 });
  }
}

export async function DELETE(request) {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId } = authResult;

  try {
    const body = await request.json();
    const endpoint = String(body?.endpoint || "");
    if (!endpoint) {
      return Response.json({ error: "Endpoint is required" }, { status: 400 });
    }

    if (!hasDatabaseConfig()) {
      return Response.json({ ok: true, source: "memory" });
    }

    const db = getDb();
    await ensurePushTable(db);
    await db`
      DELETE FROM push_subscriptions
      WHERE endpoint = ${endpoint} AND (user_id = ${userId} OR user_id IS NULL);
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to delete push subscription" }, { status: 500 });
  }
}
