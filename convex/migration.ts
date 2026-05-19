/**
 * One-time migration helpers used by `scripts/backfill-postgres-to-convex.mjs`.
 *
 * All mutations here REQUIRE a `migrationKey` arg matching the Convex env
 * `MIGRATION_KEY` (set with `npx convex env set MIGRATION_KEY <random>`).
 * Anyone without that key gets nothing.
 *
 * Delete this file (and the env var) after the cutover is complete — these
 * are not part of the normal app surface.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { ensureUserRowByClerkId } from "./lib/shared";

function checkKey(provided: string) {
  const expected = process.env.MIGRATION_KEY;
  if (!expected) throw new Error("MIGRATION_KEY not set in Convex env");
  if (provided !== expected) throw new Error("Bad migration key");
}

export const upsertShareSettings = mutation({
  args: {
    migrationKey: v.string(),
    clerkUserId: v.string(),
    enabled: v.boolean(),
    shareDisplayName: v.string(),
    inviteToken: v.optional(v.string())
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    checkKey(args.migrationKey);
    const user = await ensureUserRowByClerkId(ctx, args.clerkUserId);
    const existing = await ctx.db
      .query("shareSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    const doc = {
      userId: user._id,
      enabled: args.enabled,
      shareDisplayName: args.shareDisplayName,
      inviteToken: args.inviteToken || undefined,
      updatedAt: now
    };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("shareSettings", doc);
    return null;
  }
});

export const upsertShareGrant = mutation({
  args: {
    migrationKey: v.string(),
    ownerClerkUserId: v.string(),
    viewerClerkUserId: v.string(),
    createdAt: v.number()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    checkKey(args.migrationKey);
    const owner = await ensureUserRowByClerkId(ctx, args.ownerClerkUserId);
    const viewer = await ensureUserRowByClerkId(ctx, args.viewerClerkUserId);
    const existing = await ctx.db
      .query("shareGrants")
      .withIndex("by_owner_and_viewer", (q) =>
        q.eq("ownerUserId", owner._id).eq("viewerUserId", viewer._id)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("shareGrants", {
        ownerUserId: owner._id,
        viewerUserId: viewer._id,
        createdAt: args.createdAt
      });
    }
    return null;
  }
});

export const upsertEntryLike = mutation({
  args: {
    migrationKey: v.string(),
    ownerClerkUserId: v.string(),
    viewerClerkUserId: v.string(),
    entryId: v.string(),
    createdAt: v.number()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    checkKey(args.migrationKey);
    const owner = await ensureUserRowByClerkId(ctx, args.ownerClerkUserId);
    const viewer = await ensureUserRowByClerkId(ctx, args.viewerClerkUserId);
    const existing = await ctx.db
      .query("entryLikes")
      .withIndex("by_owner_entry_and_viewer", (q) =>
        q.eq("ownerUserId", owner._id).eq("entryId", args.entryId).eq("viewerUserId", viewer._id)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("entryLikes", {
        ownerUserId: owner._id,
        viewerUserId: viewer._id,
        entryId: args.entryId,
        createdAt: args.createdAt
      });
    }
    return null;
  }
});

export const upsertEntryComment = mutation({
  args: {
    migrationKey: v.string(),
    ownerClerkUserId: v.string(),
    authorClerkUserId: v.string(),
    entryId: v.string(),
    commentId: v.string(),
    body: v.string(),
    createdAt: v.number()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    checkKey(args.migrationKey);
    const owner = await ensureUserRowByClerkId(ctx, args.ownerClerkUserId);
    const author = await ensureUserRowByClerkId(ctx, args.authorClerkUserId);
    const existing = await ctx.db
      .query("entryComments")
      .withIndex("by_comment_id", (q) => q.eq("commentId", args.commentId))
      .unique();
    if (!existing) {
      await ctx.db.insert("entryComments", {
        ownerUserId: owner._id,
        authorUserId: author._id,
        entryId: args.entryId,
        commentId: args.commentId,
        body: args.body,
        createdAt: args.createdAt
      });
    }
    return null;
  }
});

export const upsertPushSubscription = mutation({
  args: {
    migrationKey: v.string(),
    clerkUserId: v.string(),
    endpoint: v.string(),
    subscription: v.object({
      endpoint: v.string(),
      expirationTime: v.union(v.number(), v.null()),
      keys: v.object({ p256dh: v.string(), auth: v.string() })
    }),
    createdAt: v.number()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    checkKey(args.migrationKey);
    const user = await ensureUserRowByClerkId(ctx, args.clerkUserId);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    const doc = {
      userId: user._id,
      endpoint: args.endpoint,
      subscription: args.subscription,
      createdAt: args.createdAt
    };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("pushSubscriptions", doc);
    return null;
  }
});

/**
 * One-shot restore of a user's full state JSON (the legacy Postgres blob).
 * Mirrors `state.replaceFromState` but uses migrationKey auth so it can be
 * driven by an offline script, not a Clerk session.
 */
export const restoreUserState = mutation({
  args: {
    migrationKey: v.string(),
    clerkUserId: v.string(),
    state: v.object({
      startDate: v.optional(v.union(v.string(), v.null())),
      reminderTime: v.optional(v.string()),
      tone: v.optional(v.string()),
      lastCompletedDay: v.optional(v.number()),
      streak: v.optional(v.number()),
      scenarioHistory: v.optional(v.array(v.string())),
      personalProfile: v.optional(
        v.object({
          age: v.optional(v.string()),
          birthday: v.optional(v.string()),
          country: v.optional(v.string()),
          nationality: v.optional(v.string()),
          maritalStatus: v.optional(v.string()),
          children: v.optional(v.string()),
          dog: v.optional(v.string()),
          partner: v.optional(v.string()),
          job: v.optional(v.string()),
          friends: v.optional(v.string()),
          notes: v.optional(v.string())
        })
      ),
      diary: v.optional(v.array(v.any())),
      reflections: v.optional(v.array(v.any())),
      intentions: v.optional(v.array(v.any()))
    })
  },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, args) => {
    checkKey(args.migrationKey);
    const user = await ensureUserRowByClerkId(ctx, args.clerkUserId);
    const now = Date.now();
    const state = args.state;

    // userProgress (1:1)
    const existingProgress = await ctx.db
      .query("userProgress")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const progressDoc = {
      userId: user._id,
      startDate: state.startDate ?? undefined,
      reminderTime: state.reminderTime ?? "8:00 AM",
      tone: state.tone ?? "Balanced",
      lastCompletedDay: state.lastCompletedDay ?? 0,
      streak: state.streak ?? 0,
      scenarioHistory: state.scenarioHistory ?? [],
      updatedAt: now
    };
    if (existingProgress) await ctx.db.replace(existingProgress._id, progressDoc);
    else await ctx.db.insert("userProgress", progressDoc);

    // personalProfile (1:1)
    const existingProfile = await ctx.db
      .query("personalProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const p = state.personalProfile ?? {};
    const profileDoc = {
      userId: user._id,
      age: p.age || undefined,
      birthday: p.birthday || undefined,
      country: p.country || undefined,
      nationality: p.nationality || undefined,
      maritalStatus: p.maritalStatus || undefined,
      children: p.children || undefined,
      dog: p.dog || undefined,
      partner: p.partner || undefined,
      job: p.job || undefined,
      friends: p.friends || undefined,
      notes: p.notes || undefined,
      updatedAt: now
    };
    if (existingProfile) await ctx.db.replace(existingProfile._id, profileDoc);
    else await ctx.db.insert("personalProfiles", profileDoc);

    // diary (upsert by entryId — NO destructive delete; this is recovery)
    for (const entry of state.diary ?? []) {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string") continue;
      const stepsRaw = Array.isArray(entry.triggeredSteps) ? entry.triggeredSteps : [];
      const triggeredSteps = stepsRaw.filter(
        (s: unknown): s is "step1" | "step2" | "step3" => s === "step1" || s === "step2" || s === "step3"
      );
      const source: "log" | "reflection" = entry.source === "reflection" ? "reflection" : "log";
      const doc = {
        userId: user._id,
        entryId: entry.id,
        day: typeof entry.day === "number" ? entry.day : 1,
        loggedDateKey: typeof entry.loggedDateKey === "string" ? entry.loggedDateKey : undefined,
        title: typeof entry.title === "string" ? entry.title : "",
        rawText: typeof entry.rawText === "string" ? entry.rawText : undefined,
        scenario: typeof entry.scenario === "string" ? entry.scenario : undefined,
        source,
        triggeredSteps,
        fact: typeof entry.fact === "string" ? entry.fact : undefined,
        story: typeof entry.story === "string" ? entry.story : undefined,
        outsideControl: typeof entry.outsideControl === "string" ? entry.outsideControl : undefined,
        insideControl: typeof entry.insideControl === "string" ? entry.insideControl : undefined,
        chosenResponse: typeof entry.chosenResponse === "string" ? entry.chosenResponse : undefined,
        lesson: typeof entry.lesson === "string" ? entry.lesson : undefined,
        feeling: typeof entry.feeling === "string" ? entry.feeling : undefined,
        moodBefore: typeof entry.moodBefore === "string" ? entry.moodBefore : undefined,
        moodAfter: typeof entry.moodAfter === "string" ? entry.moodAfter : undefined,
        createdAt:
          typeof entry.createdAt === "string"
            ? Date.parse(entry.createdAt) || now
            : typeof entry.createdAt === "number"
              ? entry.createdAt
              : now
      };
      const existing = await ctx.db
        .query("diaryEntries")
        .withIndex("by_user_and_entry_id", (q) => q.eq("userId", user._id).eq("entryId", entry.id))
        .unique();
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("diaryEntries", doc);
    }

    // reflections
    for (const r of state.reflections ?? []) {
      if (!r || typeof r !== "object" || typeof r.id !== "string") continue;
      const doc = {
        userId: user._id,
        reflectionId: r.id,
        day: typeof r.day === "number" ? r.day : 1,
        scenario: typeof r.scenario === "string" ? r.scenario : undefined,
        reaction: typeof r.reaction === "string" ? r.reaction : undefined,
        facts: typeof r.facts === "string" ? r.facts : undefined,
        story: typeof r.story === "string" ? r.story : undefined,
        outsideControl: typeof r.outsideControl === "string" ? r.outsideControl : undefined,
        insideControl: typeof r.insideControl === "string" ? r.insideControl : undefined,
        chosenResponse: typeof r.chosenResponse === "string" ? r.chosenResponse : undefined,
        intention: typeof r.intention === "string" ? r.intention : undefined,
        createdAt:
          typeof r.createdAt === "string"
            ? Date.parse(r.createdAt) || now
            : typeof r.createdAt === "number"
              ? r.createdAt
              : now
      };
      const existing = await ctx.db
        .query("reflections")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .filter((q) => q.eq(q.field("reflectionId"), r.id))
        .unique();
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("reflections", doc);
    }

    // intentions
    for (const i of state.intentions ?? []) {
      if (!i || typeof i !== "object" || typeof i.id !== "string" || typeof i.text !== "string") continue;
      const doc = {
        userId: user._id,
        intentionId: i.id,
        text: i.text,
        day: typeof i.day === "number" ? i.day : 1,
        createdAt: now
      };
      const existing = await ctx.db
        .query("intentions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .filter((q) => q.eq(q.field("intentionId"), i.id))
        .unique();
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("intentions", doc);
    }

    return { userId: user._id };
  }
});

export const upsertDispatchLog = mutation({
  args: {
    migrationKey: v.string(),
    clerkUserId: v.string(),
    dateKey: v.string(),
    sentAt: v.number()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    checkKey(args.migrationKey);
    const user = await ensureUserRowByClerkId(ctx, args.clerkUserId);
    const existing = await ctx.db
      .query("pushDispatchLog")
      .withIndex("by_user_and_date", (q) => q.eq("userId", user._id).eq("dateKey", args.dateKey))
      .unique();
    if (!existing) {
      await ctx.db.insert("pushDispatchLog", {
        userId: user._id,
        dateKey: args.dateKey,
        sentAt: args.sentAt
      });
    }
    return null;
  }
});
