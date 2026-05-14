/**
 * Nightly backup system.
 *
 * `snapshotAllUsers` is triggered by the daily cron in `convex/crons.ts`.
 * For each user it serializes their userProgress, personalProfile, diary,
 * reflections, intentions, shareSettings, and shareGrants into a single
 * JSON-stringified `backups.payload` row keyed by (userId, dateKey).
 *
 * Restore is performed offline via `npx convex run backups:restoreUser` (see
 * the action at the bottom) — kept as an internal action so a forgotten
 * client call can't accidentally roll someone back.
 */
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";

const RETENTION_DAYS = 14;

function todayUTCDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function stripSystemFields<T extends Doc<"diaryEntries" | "reflections" | "intentions" | "userProgress" | "personalProfiles" | "shareSettings" | "shareGrants">>(
  doc: T
): Omit<T, "_id" | "_creationTime"> {
  /** Use rest so we never accidentally serialize Convex's internal _id keys. */
  const { _id: _ignoredId, _creationTime: _ignoredCt, ...rest } = doc;
  void _ignoredId;
  void _ignoredCt;
  return rest;
}

/**
 * Daily cron entrypoint: snapshot every user, then prune anything older
 * than `RETENTION_DAYS` days.
 */
export const snapshotAllUsers = internalAction({
  args: {},
  returns: v.object({
    snapshotted: v.number(),
    deleted: v.number(),
    dateKey: v.string()
  }),
  handler: async (ctx) => {
    const dateKey = todayUTCDateKey();
    const userIds: Id<"users">[] = await ctx.runQuery(internal.backups._listUserIds, {});
    for (const userId of userIds) {
      await ctx.runMutation(internal.backups._snapshotOneUser, { userId, dateKey });
    }
    const { deleted } = await ctx.runMutation(internal.backups._pruneOlderThan, {
      keepDays: RETENTION_DAYS
    });
    return { snapshotted: userIds.length, deleted, dateKey };
  }
});

export const _listUserIds = internalQuery({
  args: {},
  returns: v.array(v.id("users")),
  handler: async (ctx) => {
    const rows = await ctx.db.query("users").collect();
    return rows.map((u) => u._id);
  }
});

export const _snapshotOneUser = internalMutation({
  args: { userId: v.id("users"), dateKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, dateKey }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const [
      progress,
      profile,
      diary,
      reflections,
      intentions,
      shareSettings,
      shareGrants
    ] = await Promise.all([
      ctx.db
        .query("userProgress")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("personalProfiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("diaryEntries")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("reflections")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("intentions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("shareSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("shareGrants")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
        .collect()
    ]);

    const payload = {
      schemaVersion: 1,
      clerkUserId: user.clerkUserId,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      progress: progress ? stripSystemFields(progress) : null,
      profile: profile ? stripSystemFields(profile) : null,
      diary: diary.map(stripSystemFields),
      reflections: reflections.map(stripSystemFields),
      intentions: intentions.map(stripSystemFields),
      shareSettings: shareSettings ? stripSystemFields(shareSettings) : null,
      shareGrants: shareGrants.map(stripSystemFields)
    };

    const existing = await ctx.db
      .query("backups")
      .withIndex("by_user_and_date", (q) => q.eq("userId", userId).eq("dateKey", dateKey))
      .unique();
    const doc = {
      userId,
      clerkUserId: user.clerkUserId,
      dateKey,
      payload: JSON.stringify(payload),
      createdAt: Date.now()
    };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("backups", doc);
    return null;
  }
});

export const _pruneOlderThan = internalMutation({
  args: { keepDays: v.number() },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { keepDays }) => {
    const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString().slice(0, 10);
    const old = await ctx.db
      .query("backups")
      .withIndex("by_date", (q) => q.lt("dateKey", cutoff))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    return { deleted: old.length };
  }
});

/**
 * Admin/inspection query — list available snapshots for a Clerk user id.
 * Read-only; identity is checked against the caller's clerkUserId so users
 * can only list their own backups via the dashboard auth.
 *
 * For cross-user inspection, use `npx convex run backups:_adminListByClerk`.
 */
export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("backups"),
      dateKey: v.string(),
      createdAt: v.number(),
      payloadBytes: v.number()
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) return [];
    const rows = await ctx.db
      .query("backups")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return rows.map((r) => ({
      _id: r._id,
      dateKey: r.dateKey,
      createdAt: r.createdAt,
      payloadBytes: r.payload.length
    }));
  }
});

/**
 * Internal restore — replay a backup row's `diary/reflections/intentions/
 * progress/profile/shareSettings/shareGrants` back into the live tables.
 *
 * NON-destructive: upserts by legacy id, never deletes. Mirrors the
 * `migration.restoreUserState` approach so it's safe to re-run.
 *
 * Run from terminal:
 *   npx convex run --prod backups:restoreFromBackup '{ "backupId": "..." }'
 *
 * Or grab the latest snapshot:
 *   npx convex run --prod backups:restoreLatestForClerk '{ "clerkUserId": "user_..." }'
 */
export const restoreFromBackup = internalMutation({
  args: { backupId: v.id("backups") },
  returns: v.object({ ok: v.boolean(), restoredFor: v.string(), dateKey: v.string() }),
  handler: async (ctx, { backupId }) => {
    const backup = await ctx.db.get(backupId);
    if (!backup) throw new Error("Backup not found");
    return await applyBackupPayload(ctx, backup.userId, backup.payload, backup.dateKey);
  }
});

export const restoreLatestForClerk = internalMutation({
  args: { clerkUserId: v.string() },
  returns: v.object({ ok: v.boolean(), restoredFor: v.string(), dateKey: v.string() }),
  handler: async (ctx, { clerkUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (!user) throw new Error(`No users row for ${clerkUserId}`);
    const rows = await ctx.db
      .query("backups")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    if (rows.length === 0) throw new Error("No backups available for this user");
    rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    const latest = rows[0];
    return await applyBackupPayload(ctx, latest.userId, latest.payload, latest.dateKey);
  }
});

async function applyBackupPayload(
  ctx: import("./_generated/server").MutationCtx,
  userId: Id<"users">,
  payloadJson: string,
  dateKey: string
): Promise<{ ok: boolean; restoredFor: string; dateKey: string }> {
  /** Parse defensively — payload was emitted by `_snapshotOneUser` so we trust the shape. */
  type StoredDoc = Record<string, unknown> & { _id?: string; _creationTime?: number };
  type BackupShape = {
    clerkUserId: string;
    progress: StoredDoc | null;
    profile: StoredDoc | null;
    diary: StoredDoc[];
    reflections: StoredDoc[];
    intentions: StoredDoc[];
    shareSettings: StoredDoc | null;
    shareGrants: StoredDoc[];
  };
  const data = JSON.parse(payloadJson) as BackupShape;
  const now = Date.now();

  // 1. userProgress (1:1)
  if (data.progress) {
    const existing = await ctx.db
      .query("userProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const doc = { ...(data.progress as Omit<Doc<"userProgress">, "_id" | "_creationTime">), userId, updatedAt: now };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("userProgress", doc);
  }

  // 2. personalProfile (1:1)
  if (data.profile) {
    const existing = await ctx.db
      .query("personalProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const doc = { ...(data.profile as Omit<Doc<"personalProfiles">, "_id" | "_creationTime">), userId, updatedAt: now };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("personalProfiles", doc);
  }

  // 3. diary (upsert by entryId)
  for (const raw of data.diary ?? []) {
    const entry = raw as Omit<Doc<"diaryEntries">, "_id" | "_creationTime">;
    if (!entry.entryId) continue;
    const existing = await ctx.db
      .query("diaryEntries")
      .withIndex("by_user_and_entry_id", (q) => q.eq("userId", userId).eq("entryId", entry.entryId))
      .unique();
    const doc = { ...entry, userId };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("diaryEntries", doc);
  }

  // 4. reflections (upsert by reflectionId)
  for (const raw of data.reflections ?? []) {
    const r = raw as Omit<Doc<"reflections">, "_id" | "_creationTime">;
    if (!r.reflectionId) continue;
    const existing = await ctx.db
      .query("reflections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("reflectionId"), r.reflectionId))
      .unique();
    const doc = { ...r, userId };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("reflections", doc);
  }

  // 5. intentions (upsert by intentionId)
  for (const raw of data.intentions ?? []) {
    const i = raw as Omit<Doc<"intentions">, "_id" | "_creationTime">;
    if (!i.intentionId) continue;
    const existing = await ctx.db
      .query("intentions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("intentionId"), i.intentionId))
      .unique();
    const doc = { ...i, userId };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("intentions", doc);
  }

  // 6. shareSettings (1:1)
  if (data.shareSettings) {
    const existing = await ctx.db
      .query("shareSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const doc = { ...(data.shareSettings as Omit<Doc<"shareSettings">, "_id" | "_creationTime">), userId, updatedAt: now };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("shareSettings", doc);
  }

  /**
   * shareGrants are owner→viewer references — restore only if both sides
   * still exist in `users`. Otherwise drop silently (a deleted viewer
   * can't get their access back from a snapshot).
   */
  for (const raw of data.shareGrants ?? []) {
    const g = raw as Omit<Doc<"shareGrants">, "_id" | "_creationTime">;
    if (!g.viewerUserId) continue;
    const viewer = await ctx.db.get(g.viewerUserId);
    if (!viewer) continue;
    const existing = await ctx.db
      .query("shareGrants")
      .withIndex("by_owner_and_viewer", (q) =>
        q.eq("ownerUserId", userId).eq("viewerUserId", g.viewerUserId)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("shareGrants", {
        ownerUserId: userId,
        viewerUserId: g.viewerUserId,
        createdAt: g.createdAt ?? now
      });
    }
  }

  return { ok: true, restoredFor: data.clerkUserId, dateKey };
}
