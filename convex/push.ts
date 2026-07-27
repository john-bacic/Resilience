import { v } from "convex/values";
import { mutation } from "./_generated/server";
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
