/**
 * Lists resilience_user_state rows (counts only — no full JSON dump).
 * Loads .env.local if present. Usage: node scripts/inspect-user-state.mjs
 */
import fs from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Missing POSTGRES_URL or DATABASE_URL (add to .env.local or export).");
  process.exit(1);
}

const db = neon(url);

try {
  const rows = await db`
    SELECT
      user_id,
      updated_at,
      COALESCE(jsonb_array_length(state->'diary'), 0) AS diary_entries,
      COALESCE(jsonb_array_length(state->'reflections'), 0) AS reflections,
      COALESCE(jsonb_array_length(state->'intentions'), 0) AS intentions,
      (state->>'lastCompletedDay')::int AS last_completed_day,
      (state->>'day')::int AS program_day
    FROM resilience_user_state
    ORDER BY updated_at DESC
    LIMIT 50;
  `;
  console.log(JSON.stringify(rows, null, 2));
  console.error(`\nRows returned: ${rows.length}`);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
