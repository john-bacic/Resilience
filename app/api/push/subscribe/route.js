import { getDb } from "@/lib/db";

async function ensurePushTable() {
  const db = getDb();
  await db`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
}

function hasDatabaseConfig() {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

export async function POST(request) {
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

    await ensurePushTable();
    const db = getDb();
    await db`
      INSERT INTO push_subscriptions (endpoint, subscription, created_at)
      VALUES (${endpoint}, ${JSON.stringify(subscription)}::jsonb, NOW())
      ON CONFLICT (endpoint) DO UPDATE
      SET subscription = EXCLUDED.subscription,
          created_at = NOW();
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to save push subscription" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const endpoint = String(body?.endpoint || "");
    if (!endpoint) {
      return Response.json({ error: "Endpoint is required" }, { status: 400 });
    }

    if (!hasDatabaseConfig()) {
      return Response.json({ ok: true, source: "memory" });
    }

    await ensurePushTable();
    const db = getDb();
    await db`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint};`;

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to delete push subscription" }, { status: 500 });
  }
}
