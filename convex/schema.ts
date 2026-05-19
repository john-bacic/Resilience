import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema mirroring the existing Postgres model used by the
 * Resilience / STOIC AF app.
 *
 * Design notes:
 *  - Each Clerk user has one row in `users`; everything else references
 *    `userId: v.id("users")`, not the raw Clerk subject. Auth helpers
 *    resolve a Clerk identity → users row.
 *  - Diary, reflections, and intentions are split into real tables (no more
 *    one giant JSON blob per user) so a buggy save can only damage one
 *    row instead of nuking the entire state.
 *  - `entryId` (and similar) preserve the legacy UUID string from the
 *    Postgres JSON state so cross-table joins (likes/comments) and the
 *    one-time migration can reconcile rows.
 *  - All timestamps are `v.number()` (ms since epoch). Convex's
 *    auto-managed `_creationTime` is preserved separately.
 */
export default defineSchema({
  /** Canonical user row keyed by Clerk subject. Created on first sign-in. */
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    updatedAt: v.number()
  }).index("by_clerk_id", ["clerkUserId"]),

  /**
   * 1:1 with `users`. Stores program progression / settings (replaces the
   * top-level fields of the legacy `resilience_user_state.state` JSON).
   */
  userProgress: defineTable({
    userId: v.id("users"),
    startDate: v.optional(v.string()),
    reminderTime: v.string(),
    tone: v.string(),
    lastCompletedDay: v.number(),
    streak: v.number(),
    /** User-configurable program duration in days. Defaults to 30. */
    programLength: v.optional(v.number()),
    /** Bounded (sliced to 2000 client-side); fine to keep inline. */
    scenarioHistory: v.array(v.string()),
    /** Program-completion badges. Embedded — small bounded list per user. */
    completions: v.optional(
      v.array(
        v.object({
          id: v.string(),
          programLength: v.number(),
          completedAt: v.string(),
          diaryCount: v.number(),
          reflectionCount: v.optional(v.number()),
          overview: v.string(),
          patterns: v.array(v.string()),
          caveat: v.optional(v.string())
        })
      )
    ),
    updatedAt: v.number()
  }).index("by_user", ["userId"]),

  /**
   * 1:1 with `users`. All-optional strings; defaults handled client-side.
   */
  personalProfiles: defineTable({
    userId: v.id("users"),
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
    notes: v.optional(v.string()),
    updatedAt: v.number()
  }).index("by_user", ["userId"]),

  /** One row per diary entry. */
  diaryEntries: defineTable({
    userId: v.id("users"),
    /** Legacy UUID from Postgres JSON. Required for likes/comments lookup + migration. */
    entryId: v.string(),
    day: v.number(),
    /** YYYY-MM-DD when the user says the event actually happened. */
    loggedDateKey: v.optional(v.string()),
    title: v.string(),
    rawText: v.optional(v.string()),
    scenario: v.optional(v.string()),
    source: v.union(v.literal("log"), v.literal("reflection")),
    triggeredSteps: v.array(
      v.union(v.literal("step1"), v.literal("step2"), v.literal("step3"))
    ),
    fact: v.optional(v.string()),
    story: v.optional(v.string()),
    outsideControl: v.optional(v.string()),
    insideControl: v.optional(v.string()),
    chosenResponse: v.optional(v.string()),
    lesson: v.optional(v.string()),
    /**
     * 1–2 word affect label (e.g. "lonely", "scared", "ashamed"). Suggested
     * by the AI from rawText, editable by the user. Affect labeling
     * (Lieberman et al., 2007) reduces amygdala reactivity via RVLPFC,
     * so the value lives next to `lesson` and is surfaced together.
     */
    feeling: v.optional(v.string()),
    moodBefore: v.optional(v.string()),
    moodAfter: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_user_and_logged_date", ["userId", "loggedDateKey"])
    .index("by_user_and_entry_id", ["userId", "entryId"]),

  /** Morning reflections (separate doc from the diary entry they spawn). */
  reflections: defineTable({
    userId: v.id("users"),
    reflectionId: v.string(),
    day: v.number(),
    scenario: v.optional(v.string()),
    reaction: v.optional(v.string()),
    facts: v.optional(v.string()),
    story: v.optional(v.string()),
    outsideControl: v.optional(v.string()),
    insideControl: v.optional(v.string()),
    chosenResponse: v.optional(v.string()),
    intention: v.optional(v.string()),
    createdAt: v.number()
  }).index("by_user", ["userId"]),

  /** Saved intentions for the "Latest intention" surface. */
  intentions: defineTable({
    userId: v.id("users"),
    intentionId: v.string(),
    text: v.string(),
    day: v.number(),
    createdAt: v.number()
  }).index("by_user", ["userId"]),

  /** Per-owner diary sharing toggles + display name + invite token. */
  shareSettings: defineTable({
    userId: v.id("users"),
    enabled: v.boolean(),
    shareDisplayName: v.string(),
    inviteToken: v.optional(v.string()),
    updatedAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_invite_token", ["inviteToken"]),

  /** Many-to-many: owner has granted access to viewer. */
  shareGrants: defineTable({
    ownerUserId: v.id("users"),
    viewerUserId: v.id("users"),
    createdAt: v.number()
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_viewer", ["viewerUserId"])
    .index("by_owner_and_viewer", ["ownerUserId", "viewerUserId"]),

  /** Likes on shared diary entries. */
  entryLikes: defineTable({
    ownerUserId: v.id("users"),
    /** Legacy diary entry UUID. */
    entryId: v.string(),
    viewerUserId: v.id("users"),
    createdAt: v.number()
  })
    .index("by_owner_and_entry", ["ownerUserId", "entryId"])
    .index("by_owner_entry_and_viewer", ["ownerUserId", "entryId", "viewerUserId"]),

  /** Comments on shared diary entries. */
  entryComments: defineTable({
    ownerUserId: v.id("users"),
    entryId: v.string(),
    authorUserId: v.id("users"),
    /** Legacy comment id (UUID) for compatibility with existing references. */
    commentId: v.string(),
    body: v.string(),
    createdAt: v.number()
  })
    .index("by_owner_and_entry", ["ownerUserId", "entryId"])
    .index("by_comment_id", ["commentId"]),

  /** Web push subscriptions. user may be null for legacy unauthenticated rows. */
  pushSubscriptions: defineTable({
    userId: v.optional(v.id("users")),
    /** Unique per browser/device — push service endpoint URL. */
    endpoint: v.string(),
    subscription: v.object({
      endpoint: v.string(),
      expirationTime: v.union(v.number(), v.null()),
      keys: v.object({
        p256dh: v.string(),
        auth: v.string()
      })
    }),
    createdAt: v.number()
  })
    .index("by_endpoint", ["endpoint"])
    .index("by_user", ["userId"]),

  /**
   * One row per (user, calendar day) the cron successfully delivered a
   * reminder push. Used to dedupe across minute ticks.
   */
  pushDispatchLog: defineTable({
    userId: v.id("users"),
    /** YYYY-MM-DD in the dispatch timezone. */
    dateKey: v.string(),
    sentAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_user_and_date", ["userId", "dateKey"]),

  /**
   * Nightly snapshots of each user's full state, written by the
   * `backups:snapshotAllUsers` internal action via `convex/crons.ts`.
   *
   * `payload` is a JSON string of `{ progress, profile, diary, reflections,
   * intentions, shareSettings, shareGrants }` for that user. Kept as a string
   * (not a deeply-validated object) so future schema changes don't break old
   * snapshots — restore is best-effort.
   *
   * Retention: 14 days (oldest pruned each run). Adjust in `snapshotAllUsers`.
   */
  backups: defineTable({
    userId: v.id("users"),
    clerkUserId: v.string(),
    /** YYYY-MM-DD UTC for the day this snapshot was taken. */
    dateKey: v.string(),
    payload: v.string(),
    createdAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_user_and_date", ["userId", "dateKey"])
    .index("by_date", ["dateKey"])
});
