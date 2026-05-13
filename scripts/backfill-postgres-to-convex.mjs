/**
 * One-time backfill: copy sharing / social / push rows from Neon Postgres
 * into Convex tables. State / diary / reflections / intentions were already
 * mirrored by the shadow-write on the next /api/state save per user — those
 * are NOT touched here.
 *
 * Usage (run from repo root):
 *   node --env-file=.env.vercel.production scripts/backfill-postgres-to-convex.mjs
 *
 * Required env (loaded automatically from --env-file or shell):
 *   POSTGRES_URL          -> Neon connection string
 *   CONVEX_URL            -> e.g. https://giant-gnat-782.convex.cloud (or NEXT_PUBLIC_CONVEX_URL)
 *   MIGRATION_KEY         -> Same value as in Convex env (set via
 *                            `npx convex env set MIGRATION_KEY <random>`)
 *
 * The script is idempotent: re-running won't create duplicates because each
 * Convex mutation upserts by Clerk userId / endpoint / (owner, entry, viewer).
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
  console.error("Missing CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL)");
  process.exit(1);
}
const MIGRATION_KEY = requireEnv("MIGRATION_KEY");

const sql = neon(POSTGRES_URL);
const convex = new ConvexHttpClient(CONVEX_URL);

async function backfillShareSettings() {
  const rows = await sql`SELECT user_id, enabled, share_display_name FROM diary_share_settings;`;
  const tokens = await sql`SELECT owner_user_id, token FROM diary_share_invite_tokens;`;
  const tokenByOwner = new Map(tokens.map((r) => [r.owner_user_id, r.token]));
  let upserts = 0;
  for (const r of rows) {
    await convex.mutation(api.migration.upsertShareSettings, {
      migrationKey: MIGRATION_KEY,
      clerkUserId: r.user_id,
      enabled: Boolean(r.enabled),
      shareDisplayName: String(r.share_display_name || ""),
      inviteToken: tokenByOwner.get(r.user_id) || undefined
    });
    upserts += 1;
  }
  console.log(`shareSettings upserted: ${upserts}`);
}

async function backfillShareGrants() {
  const rows = await sql`SELECT owner_user_id, viewer_user_id, created_at FROM diary_share_grants;`;
  let upserts = 0;
  for (const r of rows) {
    await convex.mutation(api.migration.upsertShareGrant, {
      migrationKey: MIGRATION_KEY,
      ownerClerkUserId: r.owner_user_id,
      viewerClerkUserId: r.viewer_user_id,
      createdAt: new Date(r.created_at).getTime()
    });
    upserts += 1;
  }
  console.log(`shareGrants upserted: ${upserts}`);
}

async function backfillLikes() {
  const rows = await sql`SELECT owner_user_id, entry_id, viewer_user_id, created_at FROM diary_entry_likes;`;
  let upserts = 0;
  for (const r of rows) {
    await convex.mutation(api.migration.upsertEntryLike, {
      migrationKey: MIGRATION_KEY,
      ownerClerkUserId: r.owner_user_id,
      viewerClerkUserId: r.viewer_user_id,
      entryId: r.entry_id,
      createdAt: new Date(r.created_at).getTime()
    });
    upserts += 1;
  }
  console.log(`entryLikes upserted: ${upserts}`);
}

async function backfillComments() {
  const rows = await sql`SELECT id, owner_user_id, entry_id, author_user_id, body, created_at FROM diary_entry_comments;`;
  let upserts = 0;
  for (const r of rows) {
    await convex.mutation(api.migration.upsertEntryComment, {
      migrationKey: MIGRATION_KEY,
      ownerClerkUserId: r.owner_user_id,
      authorClerkUserId: r.author_user_id,
      entryId: r.entry_id,
      commentId: r.id,
      body: r.body,
      createdAt: new Date(r.created_at).getTime()
    });
    upserts += 1;
  }
  console.log(`entryComments upserted: ${upserts}`);
}

async function backfillPushSubscriptions() {
  let rows;
  try {
    rows = await sql`SELECT endpoint, subscription, user_id, created_at FROM push_subscriptions WHERE COALESCE(user_id, '') != '';`;
  } catch (err) {
    if (err?.code === "42P01") {
      console.log("pushSubscriptions: skip (no Postgres table — push never enabled)");
      return;
    }
    throw err;
  }
  let upserts = 0;
  for (const r of rows) {
    const sub = typeof r.subscription === "string" ? JSON.parse(r.subscription) : r.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) continue;
    await convex.mutation(api.migration.upsertPushSubscription, {
      migrationKey: MIGRATION_KEY,
      clerkUserId: r.user_id,
      endpoint: r.endpoint,
      subscription: {
        endpoint: sub.endpoint,
        expirationTime: sub.expirationTime ?? null,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
      },
      createdAt: new Date(r.created_at).getTime()
    });
    upserts += 1;
  }
  console.log(`pushSubscriptions upserted: ${upserts}`);
}

async function backfillDispatchLog() {
  let rows;
  try {
    rows = await sql`SELECT user_id, date_key, sent_at FROM user_push_dispatch_log;`;
  } catch (err) {
    if (err?.code === "42P01") {
      console.log("pushDispatchLog: skip (no Postgres table — push never enabled)");
      return;
    }
    throw err;
  }
  let upserts = 0;
  for (const r of rows) {
    await convex.mutation(api.migration.upsertDispatchLog, {
      migrationKey: MIGRATION_KEY,
      clerkUserId: r.user_id,
      dateKey: r.date_key,
      sentAt: new Date(r.sent_at).getTime()
    });
    upserts += 1;
  }
  console.log(`pushDispatchLog upserted: ${upserts}`);
}

async function main() {
  console.log("Backfilling sharing + social + push from Postgres → Convex...");
  await backfillShareSettings();
  await backfillShareGrants();
  await backfillLikes();
  await backfillComments();
  await backfillPushSubscriptions();
  await backfillDispatchLog();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
