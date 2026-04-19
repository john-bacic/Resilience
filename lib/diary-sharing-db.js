export function hasDatabaseConfig() {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

export async function ensureUserStateTable(db) {
  await db`
    CREATE TABLE IF NOT EXISTS resilience_user_state (
      user_id TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
}

export async function ensureDiarySharingTables(db) {
  await ensureUserStateTable(db);
  await db`
    CREATE TABLE IF NOT EXISTS diary_share_settings (
      user_id TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await db`
    CREATE TABLE IF NOT EXISTS diary_share_grants (
      owner_user_id TEXT NOT NULL,
      viewer_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (owner_user_id, viewer_user_id)
    );
  `;
  await db`
    CREATE INDEX IF NOT EXISTS diary_share_grants_viewer_idx
    ON diary_share_grants (viewer_user_id);
  `;
}
