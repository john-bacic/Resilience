import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Resolve a Clerk user id to its `users` row, creating a stub if missing.
 * Needed when granting access / accepting invites for a user who has never
 * called `users.store` in our app (i.e. a viewer who has only signed in to
 * Clerk but never opened the app yet, or someone we're granting by email).
 */
export async function ensureUserRowByClerkId(
  ctx: MutationCtx,
  clerkUserId: string,
  defaults?: { displayName?: string; email?: string }
): Promise<Doc<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("users", {
    clerkUserId,
    displayName: defaults?.displayName || undefined,
    email: defaults?.email || undefined,
    updatedAt: now
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("ensureUserRowByClerkId insert vanished");
  return created;
}

/** Look up Clerk user id -> our `_id`, returning null when no row exists. */
export async function userIdByClerkId(
  ctx: QueryCtx | MutationCtx,
  clerkUserId: string
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
}

/** Resolve display label for a `users._id`; prefers cached fields, falls back to id slice. */
export async function labelForUserDocId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<{ clerkUserId: string; label: string }> {
  const u = await ctx.db.get(userId);
  if (!u) return { clerkUserId: "", label: "Unknown" };
  const label = (u.displayName?.trim() || u.email?.trim() || `User ${u.clerkUserId.slice(0, 8)}…`)
    .toString();
  return { clerkUserId: u.clerkUserId, label };
}
