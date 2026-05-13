import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Phase 2 (dual-write) mutation: receive the full state blob the client
 * currently sends to PUT /api/state, and reconcile it into normalized
 * Convex tables.
 *
 *  - Self-bootstraps the `users` row from the Clerk identity (so callers
 *    don't have to call `users.store` first).
 *  - Upserts `userProgress` + `personalProfiles` (1:1).
 *  - Syncs `diaryEntries`, `reflections`, `intentions` by their legacy
 *    UUID id field. Rows with ids missing from the incoming arrays are
 *    deleted so the flag-flip later is consistent.
 *
 * Once Convex is source of truth this fat mutation gets retired in favor
 * of per-action mutations (addDiaryEntry, updateDiaryEntry, …).
 */

const personalProfileValidator = v.object({
  age: v.optional(v.string()),
  birthday: v.optional(v.string()),
  maritalStatus: v.optional(v.string()),
  children: v.optional(v.string()),
  dog: v.optional(v.string()),
  partner: v.optional(v.string()),
  job: v.optional(v.string()),
  friends: v.optional(v.string()),
  notes: v.optional(v.string())
});

const diaryEntryValidator = v.object({
  id: v.string(),
  day: v.optional(v.number()),
  loggedDateKey: v.optional(v.string()),
  title: v.optional(v.string()),
  rawText: v.optional(v.string()),
  scenario: v.optional(v.string()),
  source: v.optional(v.string()),
  triggeredSteps: v.optional(v.array(v.string())),
  fact: v.optional(v.string()),
  story: v.optional(v.string()),
  outsideControl: v.optional(v.string()),
  insideControl: v.optional(v.string()),
  chosenResponse: v.optional(v.string()),
  lesson: v.optional(v.string()),
  moodBefore: v.optional(v.union(v.string(), v.null())),
  moodAfter: v.optional(v.union(v.string(), v.null())),
  createdAt: v.optional(v.string())
});

const reflectionValidator = v.object({
  id: v.string(),
  day: v.optional(v.number()),
  scenario: v.optional(v.string()),
  reaction: v.optional(v.string()),
  facts: v.optional(v.string()),
  story: v.optional(v.string()),
  outsideControl: v.optional(v.string()),
  insideControl: v.optional(v.string()),
  chosenResponse: v.optional(v.string()),
  intention: v.optional(v.string()),
  createdAt: v.optional(v.string())
});

const intentionValidator = v.object({
  id: v.string(),
  text: v.string(),
  day: v.optional(v.number())
});

const stateValidator = v.object({
  startDate: v.optional(v.union(v.string(), v.null())),
  reminderTime: v.optional(v.string()),
  tone: v.optional(v.string()),
  lastCompletedDay: v.optional(v.number()),
  streak: v.optional(v.number()),
  scenarioHistory: v.optional(v.array(v.string())),
  personalProfile: v.optional(personalProfileValidator),
  diary: v.optional(v.array(diaryEntryValidator)),
  reflections: v.optional(v.array(reflectionValidator)),
  intentions: v.optional(v.array(intentionValidator))
});

function isoToMs(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : fallback;
}

function normalizeStep(s: string): "step1" | "step2" | "step3" | null {
  return s === "step1" || s === "step2" || s === "step3" ? s : null;
}

async function ensureUser(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  const now = Date.now();
  if (existing) return existing;
  const id = await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    displayName: identity.name ?? undefined,
    email: identity.email ?? undefined,
    updatedAt: now
  });
  const inserted = await ctx.db.get(id);
  if (!inserted) throw new Error("users insert disappeared");
  return inserted;
}

export const replaceFromState = mutation({
  args: { state: stateValidator },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, { state }) => {
    const user = await ensureUser(ctx);
    const now = Date.now();

    // 1. userProgress (1:1)
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
    if (existingProgress) {
      await ctx.db.replace(existingProgress._id, progressDoc);
    } else {
      await ctx.db.insert("userProgress", progressDoc);
    }

    // 2. personalProfile (1:1)
    const existingProfile = await ctx.db
      .query("personalProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const profile = state.personalProfile ?? {};
    const profileDoc = {
      userId: user._id,
      age: profile.age || undefined,
      birthday: profile.birthday || undefined,
      maritalStatus: profile.maritalStatus || undefined,
      children: profile.children || undefined,
      dog: profile.dog || undefined,
      partner: profile.partner || undefined,
      job: profile.job || undefined,
      friends: profile.friends || undefined,
      notes: profile.notes || undefined,
      updatedAt: now
    };
    if (existingProfile) {
      await ctx.db.replace(existingProfile._id, profileDoc);
    } else {
      await ctx.db.insert("personalProfiles", profileDoc);
    }

    // 3. diaryEntries (sync by legacy `entryId`)
    const incomingDiary = state.diary ?? [];
    const existingDiary = await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    /**
     * Safety guard against the empty-hydration race: refuse to wipe a non-empty
     * server-side diary with an empty client payload. Real deletes go one entry
     * at a time so they never trip this. Users genuinely wanting "delete all"
     * would need a separate explicit endpoint.
     */
    if (incomingDiary.length === 0 && existingDiary.length > 0) {
      throw new Error(
        `Refusing to wipe ${existingDiary.length} diary entries with an empty payload. Aborting save.`
      );
    }
    const existingDiaryByEntryId = new Map<string, Id<"diaryEntries">>(
      existingDiary.map((d) => [d.entryId, d._id])
    );
    const incomingDiaryIds = new Set(incomingDiary.map((d) => d.id));

    for (const entry of incomingDiary) {
      const steps = (entry.triggeredSteps ?? [])
        .map(normalizeStep)
        .filter((s): s is "step1" | "step2" | "step3" => s !== null);
      const source: "log" | "reflection" = entry.source === "reflection" ? "reflection" : "log";
      const doc = {
        userId: user._id,
        entryId: entry.id,
        day: entry.day ?? 1,
        loggedDateKey: entry.loggedDateKey || undefined,
        title: entry.title ?? "",
        rawText: entry.rawText || undefined,
        scenario: entry.scenario || undefined,
        source,
        triggeredSteps: steps,
        fact: entry.fact || undefined,
        story: entry.story || undefined,
        outsideControl: entry.outsideControl || undefined,
        insideControl: entry.insideControl || undefined,
        chosenResponse: entry.chosenResponse || undefined,
        lesson: entry.lesson || undefined,
        moodBefore: entry.moodBefore || undefined,
        moodAfter: entry.moodAfter || undefined,
        createdAt: isoToMs(entry.createdAt, now)
      };
      const existingId = existingDiaryByEntryId.get(entry.id);
      if (existingId) {
        await ctx.db.replace(existingId, doc);
      } else {
        await ctx.db.insert("diaryEntries", doc);
      }
    }
    for (const existing of existingDiary) {
      if (!incomingDiaryIds.has(existing.entryId)) {
        await ctx.db.delete(existing._id);
      }
    }

    // 4. reflections (sync by legacy `reflectionId`)
    const incomingReflections = state.reflections ?? [];
    const existingReflections = await ctx.db
      .query("reflections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const existingReflectionsByLegacyId = new Map<string, Id<"reflections">>(
      existingReflections.map((d) => [d.reflectionId, d._id])
    );
    const incomingReflectionIds = new Set(incomingReflections.map((r) => r.id));

    for (const r of incomingReflections) {
      const doc = {
        userId: user._id,
        reflectionId: r.id,
        day: r.day ?? 1,
        scenario: r.scenario || undefined,
        reaction: r.reaction || undefined,
        facts: r.facts || undefined,
        story: r.story || undefined,
        outsideControl: r.outsideControl || undefined,
        insideControl: r.insideControl || undefined,
        chosenResponse: r.chosenResponse || undefined,
        intention: r.intention || undefined,
        createdAt: isoToMs(r.createdAt, now)
      };
      const existingId = existingReflectionsByLegacyId.get(r.id);
      if (existingId) {
        await ctx.db.replace(existingId, doc);
      } else {
        await ctx.db.insert("reflections", doc);
      }
    }
    for (const existing of existingReflections) {
      if (!incomingReflectionIds.has(existing.reflectionId)) {
        await ctx.db.delete(existing._id);
      }
    }

    // 5. intentions (sync by legacy `intentionId`)
    const incomingIntentions = state.intentions ?? [];
    const existingIntentions = await ctx.db
      .query("intentions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const existingIntentionsByLegacyId = new Map<string, Id<"intentions">>(
      existingIntentions.map((d) => [d.intentionId, d._id])
    );
    const incomingIntentionIds = new Set(incomingIntentions.map((i) => i.id));

    for (const i of incomingIntentions) {
      const doc = {
        userId: user._id,
        intentionId: i.id,
        text: i.text,
        day: i.day ?? 1,
        createdAt: now
      };
      const existingId = existingIntentionsByLegacyId.get(i.id);
      if (existingId) {
        await ctx.db.replace(existingId, doc);
      } else {
        await ctx.db.insert("intentions", doc);
      }
    }
    for (const existing of existingIntentions) {
      if (!incomingIntentionIds.has(existing.intentionId)) {
        await ctx.db.delete(existing._id);
      }
    }

    return { userId: user._id };
  }
});

/**
 * Read-only mirror of the legacy `state` JSON shape so future code can
 * `useQuery(api.state.getCurrent)` and drop in unchanged.
 *
 * Returns `null` when unauthenticated OR when no Convex row exists yet
 * (so the client can fall through to Postgres during the transition).
 */
export const getCurrent = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      startDate: v.union(v.string(), v.null()),
      reminderTime: v.string(),
      tone: v.string(),
      lastCompletedDay: v.number(),
      streak: v.number(),
      scenarioHistory: v.array(v.string()),
      personalProfile: personalProfileValidator,
      diary: v.array(diaryEntryValidator),
      reflections: v.array(reflectionValidator),
      intentions: v.array(intentionValidator)
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) return null;

    const progress = await ctx.db
      .query("userProgress")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const profile = await ctx.db
      .query("personalProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const diaryRows = await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const reflectionRows = await ctx.db
      .query("reflections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const intentionRows = await ctx.db
      .query("intentions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return {
      startDate: progress?.startDate ?? null,
      reminderTime: progress?.reminderTime ?? "8:00 AM",
      tone: progress?.tone ?? "Balanced",
      lastCompletedDay: progress?.lastCompletedDay ?? 0,
      streak: progress?.streak ?? 0,
      scenarioHistory: progress?.scenarioHistory ?? [],
      personalProfile: {
        age: profile?.age ?? "",
        birthday: profile?.birthday ?? "",
        maritalStatus: profile?.maritalStatus ?? "",
        children: profile?.children ?? "",
        dog: profile?.dog ?? "",
        partner: profile?.partner ?? "",
        job: profile?.job ?? "",
        friends: profile?.friends ?? "",
        notes: profile?.notes ?? ""
      },
      diary: diaryRows.map((d) => ({
        id: d.entryId,
        day: d.day,
        loggedDateKey: d.loggedDateKey,
        title: d.title,
        rawText: d.rawText,
        scenario: d.scenario,
        source: d.source,
        triggeredSteps: d.triggeredSteps,
        fact: d.fact,
        story: d.story,
        outsideControl: d.outsideControl,
        insideControl: d.insideControl,
        chosenResponse: d.chosenResponse,
        lesson: d.lesson,
        moodBefore: d.moodBefore ?? null,
        moodAfter: d.moodAfter ?? null,
        createdAt: new Date(d.createdAt).toISOString()
      })),
      reflections: reflectionRows.map((r) => ({
        id: r.reflectionId,
        day: r.day,
        scenario: r.scenario,
        reaction: r.reaction,
        facts: r.facts,
        story: r.story,
        outsideControl: r.outsideControl,
        insideControl: r.insideControl,
        chosenResponse: r.chosenResponse,
        intention: r.intention,
        createdAt: new Date(r.createdAt).toISOString()
      })),
      intentions: intentionRows.map((i) => ({
        id: i.intentionId,
        text: i.text,
        day: i.day
      }))
    };
  }
});
