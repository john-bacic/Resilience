/**
 * Recovery: replay each user's full state JSON from Postgres into Convex.
 *
 * Use after a regression where Convex tables (diary/reflections/intentions
 * etc.) were emptied but `resilience_user_state.state` in Postgres is still
 * intact.
 *
 * Idempotent — upserts by legacy id.
 *
 *   MIGRATION_KEY=$(cat /tmp/migration_key.txt) \
 *   node --env-file=.env.local scripts/restore-state-from-postgres.mjs
 */
import { ConvexHttpClient } from "convex/browser";
import { neon } from "@neondatabase/serverless";
import { api } from "../convex/_generated/api.js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

const POSTGRES_URL = requireEnv("POSTGRES_URL");
const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error("Missing CONVEX_URL or NEXT_PUBLIC_CONVEX_URL");
  process.exit(1);
}
const MIGRATION_KEY = requireEnv("MIGRATION_KEY");

const sql = neon(POSTGRES_URL);
const convex = new ConvexHttpClient(CONVEX_URL);

async function main() {
  const rows = await sql`SELECT user_id, state FROM resilience_user_state;`;
  console.log(`Restoring ${rows.length} user state blob(s) to Convex...`);
  let ok = 0;
  let skipped = 0;
  for (const row of rows) {
    const clerkUserId = row.user_id;
    let state;
    try {
      state = typeof row.state === "string" ? JSON.parse(row.state) : row.state;
    } catch {
      console.error(`  skip ${clerkUserId}: state not JSON`);
      skipped += 1;
      continue;
    }
    if (!state || typeof state !== "object") {
      skipped += 1;
      continue;
    }
    /** Trim unknown fields so Convex validator doesn't reject. */
    const trimmed = {
      startDate: state.startDate ?? null,
      reminderTime: typeof state.reminderTime === "string" ? state.reminderTime : "8:00 AM",
      tone: typeof state.tone === "string" ? state.tone : "Balanced",
      lastCompletedDay: Number(state.lastCompletedDay) || 0,
      streak: Number(state.streak) || 0,
      scenarioHistory: Array.isArray(state.scenarioHistory)
        ? state.scenarioHistory.filter((s) => typeof s === "string")
        : [],
      personalProfile:
        state.personalProfile && typeof state.personalProfile === "object" ? state.personalProfile : {},
      diary: Array.isArray(state.diary) ? state.diary.filter((d) => d && typeof d?.id === "string") : [],
      reflections: Array.isArray(state.reflections)
        ? state.reflections.filter((r) => r && typeof r?.id === "string")
        : [],
      intentions: Array.isArray(state.intentions)
        ? state.intentions.filter((i) => i && typeof i?.id === "string" && typeof i?.text === "string")
        : []
    };
    try {
      await convex.mutation(api.migration.restoreUserState, {
        migrationKey: MIGRATION_KEY,
        clerkUserId,
        state: trimmed
      });
      console.log(
        `  ok ${clerkUserId}  diary=${trimmed.diary.length} reflections=${trimmed.reflections.length} intentions=${trimmed.intentions.length}`
      );
      ok += 1;
    } catch (e) {
      console.error(`  FAIL ${clerkUserId}:`, e?.message || e);
    }
  }
  console.log(`Done. ok=${ok} skipped=${skipped} total=${rows.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
