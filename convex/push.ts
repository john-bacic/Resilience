import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";

/** Subscription payload as serialised by `PushSubscription.toJSON()`. */
const subscriptionValidator = v.object({
  endpoint: v.string(),
  expirationTime: v.union(v.number(), v.null()),
  keys: v.object({ p256dh: v.string(), auth: v.string() })
});

/**
 * Subscribe the current Clerk user's browser to web push.
 * Idempotent: same endpoint replaces the previous subscription for that endpoint.
 */
export const subscribe = mutation({
  args: { subscription: subscriptionValidator },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const endpoint = args.subscription.endpoint;
    if (!endpoint) throw new Error("Missing endpoint");

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    const doc = {
      userId: user._id,
      endpoint,
      subscription: args.subscription,
      createdAt: Date.now()
    };
    if (existing) {
      await ctx.db.replace(existing._id, doc);
    } else {
      await ctx.db.insert("pushSubscriptions", doc);
    }
    return { ok: true };
  }
});

/** Unsubscribe by endpoint. Idempotent. */
export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing) {
      if (existing.userId && existing.userId !== user._id) {
        // belongs to someone else — refuse instead of leaking
        throw new Error("Forbidden");
      }
      await ctx.db.delete(existing._id);
    }
    return { ok: true };
  }
});

/** =========================================================================
 *  Internal helpers consumed by the cron dispatch action (`pushDispatch.ts`).
 *  ========================================================================= */

/** Internal: list all push subscriptions with an owning userId. */
export const internalListSubscriptions = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("pushSubscriptions"),
      endpoint: v.string(),
      subscription: subscriptionValidator,
      userId: v.optional(v.id("users")),
      reminderTime: v.string()
    })
  ),
  handler: async (ctx) => {
    const subs = await ctx.db.query("pushSubscriptions").collect();
    const results = [] as Array<{
      _id: import("./_generated/dataModel").Id<"pushSubscriptions">;
      endpoint: string;
      subscription: typeof subs[number]["subscription"];
      userId?: import("./_generated/dataModel").Id<"users">;
      reminderTime: string;
    }>;
    for (const s of subs) {
      if (!s.userId) continue;
      const progress = await ctx.db
        .query("userProgress")
        .withIndex("by_user", (q) => q.eq("userId", s.userId!))
        .unique();
      results.push({
        _id: s._id,
        endpoint: s.endpoint,
        subscription: s.subscription,
        userId: s.userId,
        reminderTime: progress?.reminderTime ?? "8:00 AM"
      });
    }
    return results;
  }
});

/** Internal: delete a subscription that the push service rejected (404/410). */
export const internalDeleteSubscription = internalMutation({
  args: { subscriptionId: v.id("pushSubscriptions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.subscriptionId);
    if (row) await ctx.db.delete(args.subscriptionId);
    return null;
  }
});

/**
 * Internal: has this user already been pushed today (idempotency)?
 * `dateKey` is the YYYY-MM-DD computed in the dispatch action.
 */
export const internalWasSentToday = internalQuery({
  args: { userId: v.id("users"), dateKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("pushDispatchLog")
      .withIndex("by_user_and_date", (q) => q.eq("userId", args.userId).eq("dateKey", args.dateKey))
      .unique();
    return Boolean(row);
  }
});

/** Internal: mark today's reminder as sent for this user. Idempotent. */
export const internalMarkSent = internalMutation({
  args: { userId: v.id("users"), dateKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushDispatchLog")
      .withIndex("by_user_and_date", (q) => q.eq("userId", args.userId).eq("dateKey", args.dateKey))
      .unique();
    if (!existing) {
      await ctx.db.insert("pushDispatchLog", {
        userId: args.userId,
        dateKey: args.dateKey,
        sentAt: Date.now()
      });
    }
    return null;
  }
});
