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
      share_display_name TEXT NOT NULL DEFAULT '',
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
  await db`
    ALTER TABLE diary_share_settings
    ADD COLUMN IF NOT EXISTS share_display_name TEXT NOT NULL DEFAULT '';
  `;
  await db`
    CREATE TABLE IF NOT EXISTS diary_share_invite_tokens (
      owner_user_id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await ensureDiaryEntrySocialTables(db);
}

/** Likes and comments on shared diary entries (keyed by owner + entry id from JSON state). */
export async function ensureDiaryEntrySocialTables(db) {
  await db`
    CREATE TABLE IF NOT EXISTS diary_entry_likes (
      owner_user_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      viewer_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (owner_user_id, entry_id, viewer_user_id)
    );
  `;
  await db`
    CREATE INDEX IF NOT EXISTS diary_entry_likes_owner_entry_idx
    ON diary_entry_likes (owner_user_id, entry_id);
  `;
  await db`
    CREATE TABLE IF NOT EXISTS diary_entry_comments (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      author_user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await db`
    CREATE INDEX IF NOT EXISTS diary_entry_comments_owner_entry_idx
    ON diary_entry_comments (owner_user_id, entry_id);
  `;
}
