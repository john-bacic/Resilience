import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";

const MAX_COMMENT_LEN = 2000;

const commentValidator = v.object({
  id: v.string(),
  authorUserId: v.string(),
  authorLabel: v.string(),
  body: v.string(),
  createdAt: v.string()
});

const reactionsPayloadValidator = v.object({
  likeCount: v.number(),
  likedByMe: v.boolean(),
  comments: v.array(commentValidator)
});

const ownerReactionsDetailValidator = v.object({
  entryId: v.string(),
  likeCount: v.number(),
  likes: v.array(v.object({ viewerUserId: v.string(), label: v.string() })),
  comments: v.array(commentValidator)
});

const ownerReactionsSummaryValidator = v.object({
  entries: v.array(
    v.object({ entryId: v.string(), likeCount: v.number(), commentCount: v.number() })
  )
});

/** Generic helpers */

async function diaryEntryExists(
  ctx: import("./_generated/server").QueryCtx | import("./_generated/server").MutationCtx,
  ownerDocId: import("./_generated/dataModel").Id<"users">,
  entryId: string
): Promise<boolean> {
  const row = await ctx.db
    .query("diaryEntries")
    .withIndex("by_user_and_entry_id", (q) => q.eq("userId", ownerDocId).eq("entryId", entryId))
    .unique();
  return Boolean(row);
}

async function ownerDocByClerkId(
  ctx: import("./_generated/server").QueryCtx | import("./_generated/server").MutationCtx,
  clerkUserId: string
) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
}

async function viewerCanRead(
  ctx: import("./_generated/server").QueryCtx | import("./_generated/server").MutationCtx,
  ownerDocId: import("./_generated/dataModel").Id<"users">,
  viewerDocId: import("./_generated/dataModel").Id<"users">
): Promise<boolean> {
  const settings = await ctx.db
    .query("shareSettings")
    .withIndex("by_user", (q) => q.eq("userId", ownerDocId))
    .unique();
  if (!settings?.enabled) return false;
  const grant = await ctx.db
    .query("shareGrants")
    .withIndex("by_owner_and_viewer", (q) =>
      q.eq("ownerUserId", ownerDocId).eq("viewerUserId", viewerDocId)
    )
    .unique();
  return Boolean(grant);
}

async function fetchReactionsPayload(
  ctx: import("./_generated/server").QueryCtx | import("./_generated/server").MutationCtx,
  ownerDocId: import("./_generated/dataModel").Id<"users">,
  entryId: string,
  viewerDocId: import("./_generated/dataModel").Id<"users">
) {
  const likeRows = await ctx.db
    .query("entryLikes")
    .withIndex("by_owner_and_entry", (q) => q.eq("ownerUserId", ownerDocId).eq("entryId", entryId))
    .collect();
  likeRows.sort((a, b) => a.createdAt - b.createdAt);
  const commentRows = await ctx.db
    .query("entryComments")
    .withIndex("by_owner_and_entry", (q) => q.eq("ownerUserId", ownerDocId).eq("entryId", entryId))
    .collect();
  commentRows.sort((a, b) => a.createdAt - b.createdAt);

  const likedByMe = likeRows.some((r) => r.viewerUserId === viewerDocId);

  const authorDocs = await Promise.all(commentRows.map((r) => ctx.db.get(r.authorUserId)));
  const comments = commentRows.map((r, i) => {
    const a = authorDocs[i];
    const label = a
      ? a.displayName?.trim() || a.email?.trim() || `User ${a.clerkUserId.slice(0, 8)}…`
      : "Unknown";
    const authorClerkId = a?.clerkUserId ?? "";
    return {
      id: r.commentId,
      authorUserId: authorClerkId,
      authorLabel: label,
      body: r.body,
      createdAt: new Date(r.createdAt).toISOString()
    };
  });

  return { likeCount: likeRows.length, likedByMe, comments };
}

/** =========================================================================
 *  VIEWER endpoints (someone reading a diary that's been shared with them)
 *  ========================================================================= */

export const getEntryReactionsForViewer = query({
  args: { ownerClerkUserId: v.string(), entryId: v.string() },
  returns: reactionsPayloadValidator,
  handler: async (ctx, args) => {
    const viewer = await requireCurrentUser(ctx);
    if (args.ownerClerkUserId === viewer.clerkUserId) {
      throw new Error("Use owner reactions API for your own diary");
    }
    const owner = await ownerDocByClerkId(ctx, args.ownerClerkUserId);
    if (!owner) throw new Error("Forbidden");
    if (!(await viewerCanRead(ctx, owner._id, viewer._id))) throw new Error("Forbidden");
    if (!(await diaryEntryExists(ctx, owner._id, args.entryId))) throw new Error("Entry not found");
    return await fetchReactionsPayload(ctx, owner._id, args.entryId, viewer._id);
  }
});

export const toggleLike = mutation({
  args: { ownerClerkUserId: v.string(), entryId: v.string() },
  returns: reactionsPayloadValidator,
  handler: async (ctx, args) => {
    const viewer = await requireCurrentUser(ctx);
    if (args.ownerClerkUserId === viewer.clerkUserId) throw new Error("Forbidden");
    const owner = await ownerDocByClerkId(ctx, args.ownerClerkUserId);
    if (!owner) throw new Error("Forbidden");
    if (!(await viewerCanRead(ctx, owner._id, viewer._id))) throw new Error("Forbidden");
    if (!(await diaryEntryExists(ctx, owner._id, args.entryId))) throw new Error("Entry not found");

    const existing = await ctx.db
      .query("entryLikes")
      .withIndex("by_owner_entry_and_viewer", (q) =>
        q.eq("ownerUserId", owner._id).eq("entryId", args.entryId).eq("viewerUserId", viewer._id)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.insert("entryLikes", {
        ownerUserId: owner._id,
        entryId: args.entryId,
        viewerUserId: viewer._id,
        createdAt: Date.now()
      });
    }
    return await fetchReactionsPayload(ctx, owner._id, args.entryId, viewer._id);
  }
});

export const addComment = mutation({
  args: { ownerClerkUserId: v.string(), entryId: v.string(), body: v.string() },
  returns: reactionsPayloadValidator,
  handler: async (ctx, args) => {
    const viewer = await requireCurrentUser(ctx);
    if (args.ownerClerkUserId === viewer.clerkUserId) throw new Error("Forbidden");
    const owner = await ownerDocByClerkId(ctx, args.ownerClerkUserId);
    if (!owner) throw new Error("Forbidden");
    if (!(await viewerCanRead(ctx, owner._id, viewer._id))) throw new Error("Forbidden");
    if (!(await diaryEntryExists(ctx, owner._id, args.entryId))) throw new Error("Entry not found");

    const text = args.body.trim();
    if (!text) throw new Error("Comment cannot be empty");
    if (text.length > MAX_COMMENT_LEN) throw new Error(`Comment too long (max ${MAX_COMMENT_LEN})`);

    /** Legacy commentId for cross-reference with old Postgres rows. */
    const commentId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    await ctx.db.insert("entryComments", {
      ownerUserId: owner._id,
      entryId: args.entryId,
      authorUserId: viewer._id,
      commentId,
      body: text,
      createdAt: Date.now()
    });
    return await fetchReactionsPayload(ctx, owner._id, args.entryId, viewer._id);
  }
});

/**
 * Delete a comment. Either the author OR the diary owner can delete.
 * Returns { ok: true } to match legacy API.
 */
export const deleteComment = mutation({
  args: { ownerClerkUserId: v.string(), entryId: v.string(), commentId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const me = await requireCurrentUser(ctx);
    const owner = await ownerDocByClerkId(ctx, args.ownerClerkUserId);
    if (!owner) throw new Error("Not found");
    if (!(await diaryEntryExists(ctx, owner._id, args.entryId))) throw new Error("Entry not found");

    const comment = await ctx.db
      .query("entryComments")
      .withIndex("by_comment_id", (q) => q.eq("commentId", args.commentId))
      .unique();
    if (!comment) throw new Error("Not found");
    if (comment.ownerUserId !== owner._id || comment.entryId !== args.entryId) {
      throw new Error("Not found");
    }

    const isOwner = me._id === owner._id;
    const isAuthor = me._id === comment.authorUserId;
    if (!isOwner && !isAuthor) throw new Error("Forbidden");

    await ctx.db.delete(comment._id);
    return { ok: true };
  }
});

/** =========================================================================
 *  OWNER endpoints
 *  ========================================================================= */

/** Full reaction detail on one of MY entries (or summary if entryId omitted). */
export const ownerReactionsForEntry = query({
  args: { entryId: v.string() },
  returns: ownerReactionsDetailValidator,
  handler: async (ctx, args) => {
    const owner = await requireCurrentUser(ctx);
    if (!(await diaryEntryExists(ctx, owner._id, args.entryId))) {
      throw new Error("Entry not found");
    }
    const likeRows = await ctx.db
      .query("entryLikes")
      .withIndex("by_owner_and_entry", (q) => q.eq("ownerUserId", owner._id).eq("entryId", args.entryId))
      .collect();
    likeRows.sort((a, b) => a.createdAt - b.createdAt);
    const commentRows = await ctx.db
      .query("entryComments")
      .withIndex("by_owner_and_entry", (q) => q.eq("ownerUserId", owner._id).eq("entryId", args.entryId))
      .collect();
    commentRows.sort((a, b) => a.createdAt - b.createdAt);

    const viewerDocs = await Promise.all(likeRows.map((r) => ctx.db.get(r.viewerUserId)));
    const authorDocs = await Promise.all(commentRows.map((r) => ctx.db.get(r.authorUserId)));

    const likes = likeRows.map((_, i) => {
      const v = viewerDocs[i];
      const label = v
        ? v.displayName?.trim() || v.email?.trim() || `User ${v.clerkUserId.slice(0, 8)}…`
        : "Unknown";
      return { viewerUserId: v?.clerkUserId ?? "", label };
    });
    const comments = commentRows.map((r, i) => {
      const a = authorDocs[i];
      const label = a
        ? a.displayName?.trim() || a.email?.trim() || `User ${a.clerkUserId.slice(0, 8)}…`
        : "Unknown";
      return {
        id: r.commentId,
        authorUserId: a?.clerkUserId ?? "",
        authorLabel: label,
        body: r.body,
        createdAt: new Date(r.createdAt).toISOString()
      };
    });
    return {
      entryId: args.entryId,
      likeCount: likeRows.length,
      likes,
      comments
    };
  }
});

/** Summary: counts per entryId for all my entries with any reaction. */
export const ownerReactionsSummary = query({
  args: { limit: v.optional(v.number()) },
  returns: ownerReactionsSummaryValidator,
  handler: async (ctx, args) => {
    const owner = await requireCurrentUser(ctx);
    const limit = Math.min(500, Math.max(1, args.limit ?? 200));

    const likeRows = await ctx.db
      .query("entryLikes")
      .withIndex("by_owner_and_entry", (q) => q.eq("ownerUserId", owner._id))
      .collect();
    const commentRows = await ctx.db
      .query("entryComments")
      .withIndex("by_owner_and_entry", (q) => q.eq("ownerUserId", owner._id))
      .collect();

    const byEntry = new Map<string, { entryId: string; likeCount: number; commentCount: number }>();
    for (const r of likeRows) {
      const e = byEntry.get(r.entryId) ?? { entryId: r.entryId, likeCount: 0, commentCount: 0 };
      e.likeCount += 1;
      byEntry.set(r.entryId, e);
    }
    for (const r of commentRows) {
      const e = byEntry.get(r.entryId) ?? { entryId: r.entryId, likeCount: 0, commentCount: 0 };
      e.commentCount += 1;
      byEntry.set(r.entryId, e);
    }
    return { entries: [...byEntry.values()].slice(0, limit) };
  }
});
