import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrNull } from "./lib/auth";

/**
 * Idempotent: ensure the calling Clerk identity has a row in `users`.
 * Returns the canonical user document.
 *
 * Call this from `ConvexClientProvider` on first auth event so other
 * mutations can use `requireCurrentUser`.
 */
export const store = mutation({
  args: {
    displayName: v.optional(v.string()),
    email: v.optional(v.string())
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    const now = Date.now();
    const displayName = args.displayName ?? identity.name ?? "";
    const email = args.email ?? identity.email ?? "";

    if (existing) {
      const patch: Partial<{ displayName: string; email: string; updatedAt: number }> = {
        updatedAt: now
      };
      if (displayName && displayName !== existing.displayName) patch.displayName = displayName;
      if (email && email !== existing.email) patch.email = email;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      displayName: displayName || undefined,
      email: email || undefined,
      updatedAt: now
    });
  }
});

/** Read-only "me" — returns null when signed out or before `store` ran. */
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      clerkUserId: v.string(),
      email: v.optional(v.string()),
      displayName: v.optional(v.string()),
      updatedAt: v.number()
    })
  ),
  handler: async (ctx) => {
    return await getCurrentUserOrNull(ctx);
  }
});
