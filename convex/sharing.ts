import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { getCurrentUserOrNull, requireCurrentUser } from "./lib/auth";
import { ensureUserRowByClerkId, labelForUserDocId } from "./lib/shared";
import { fetchClerkUserLabel, findClerkUserByEmail } from "./lib/clerk";

/** Default payload for users with no Convex `users` row yet (first sign-in). */
const EMPTY_SETTINGS = {
  enabled: false,
  shareDisplayName: "",
  inviteUrl: null,
  grantedTo: [],
  grants: []
} as const;

const DISPLAY_NAME_MAX = 80;

/**
 * Cryptographically-random 48 hex char token using globalThis.crypto.
 * Convex actions/V8 runtime expose it on `globalThis`.
 */
function randomInviteToken(): string {
  const buf = new Uint8Array(24);
  // V8 runtime: globalThis.crypto is available
  (globalThis as { crypto: Crypto }).crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

const settingsValidator = v.object({
  enabled: v.boolean(),
  shareDisplayName: v.string(),
  inviteUrl: v.union(v.string(), v.null()),
  grantedTo: v.array(v.string()),
  grants: v.array(v.object({ userId: v.string(), label: v.string() }))
});

/** Build the full owner settings payload (used by both GET + PATCH responses). */
async function buildSettingsPayload(
  ctx: import("./_generated/server").QueryCtx | import("./_generated/server").MutationCtx,
  userDocId: import("./_generated/dataModel").Id<"users">,
  appOrigin: string | null
) {
  const settings = await ctx.db
    .query("shareSettings")
    .withIndex("by_user", (q) => q.eq("userId", userDocId))
    .unique();
  const enabled = settings?.enabled ?? false;
  const shareDisplayName = settings?.shareDisplayName ?? "";

  const grantRows = await ctx.db
    .query("shareGrants")
    .withIndex("by_owner", (q) => q.eq("ownerUserId", userDocId))
    .collect();
  grantRows.sort((a, b) => a.createdAt - b.createdAt);

  const grants = await Promise.all(
    grantRows.map(async (g) => {
      const { clerkUserId, label } = await labelForUserDocId(ctx, g.viewerUserId);
      return { userId: clerkUserId, label };
    })
  );
  const grantedTo = grants.map((g) => g.userId);

  const inviteUrl =
    enabled && settings?.inviteToken && appOrigin
      ? `${appOrigin}/share/join?t=${encodeURIComponent(settings.inviteToken)}`
      : null;

  return { enabled, shareDisplayName, inviteUrl, grantedTo, grants };
}

/**
 * Owner: load my sharing settings + grants.
 * `appOrigin` is passed by client so invite URL is built with the right host.
 */
export const getSettings = query({
  args: { appOrigin: v.optional(v.string()) },
  returns: settingsValidator,
  handler: async (ctx, args) => {
    /**
     * Tolerate "no users row yet" — first-time signed-in users may hit this
     * before any mutation has bootstrapped their row. Return safe defaults
     * instead of throwing.
     */
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return { ...EMPTY_SETTINGS };
    return await buildSettingsPayload(ctx, user._id, args.appOrigin ?? null);
  }
});

/**
 * Owner: update enabled flag and/or display name (both optional).
 * Returns the full settings payload, same shape as `getSettings`.
 */
export const updateSettings = mutation({
  args: {
    enabled: v.optional(v.boolean()),
    shareDisplayName: v.optional(v.string()),
    appOrigin: v.optional(v.string())
  },
  returns: settingsValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    if (args.shareDisplayName !== undefined && args.shareDisplayName.length > DISPLAY_NAME_MAX) {
      throw new Error(`Display name must be ${DISPLAY_NAME_MAX} characters or less`);
    }

    const existing = await ctx.db
      .query("shareSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: now };
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      if (args.shareDisplayName !== undefined) patch.shareDisplayName = args.shareDisplayName.trim();
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("shareSettings", {
        userId: user._id,
        enabled: args.enabled ?? false,
        shareDisplayName: (args.shareDisplayName ?? "").trim(),
        inviteToken: undefined,
        updatedAt: now
      });
    }

    return await buildSettingsPayload(ctx, user._id, args.appOrigin ?? null);
  }
});

/** Owner: rotate (or create) invite token. Returns the full settings payload. */
export const rotateInvite = mutation({
  args: { appOrigin: v.optional(v.string()) },
  returns: settingsValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();
    const token = randomInviteToken();

    const existing = await ctx.db
      .query("shareSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { inviteToken: token, updatedAt: now });
    } else {
      await ctx.db.insert("shareSettings", {
        userId: user._id,
        enabled: false,
        shareDisplayName: "",
        inviteToken: token,
        updatedAt: now
      });
    }
    return await buildSettingsPayload(ctx, user._id, args.appOrigin ?? null);
  }
});

/**
 * Owner: revoke a viewer by their Clerk user id. No-op if grant didn't exist.
 */
export const revokeGrant = mutation({
  args: { viewerClerkUserId: v.string(), appOrigin: v.optional(v.string()) },
  returns: settingsValidator,
  handler: async (ctx, args) => {
    const owner = await requireCurrentUser(ctx);

    const viewer = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.viewerClerkUserId))
      .unique();
    if (viewer) {
      const grant = await ctx.db
        .query("shareGrants")
        .withIndex("by_owner_and_viewer", (q) =>
          q.eq("ownerUserId", owner._id).eq("viewerUserId", viewer._id)
        )
        .unique();
      if (grant) await ctx.db.delete(grant._id);
    }
    return await buildSettingsPayload(ctx, owner._id, args.appOrigin ?? null);
  }
});

/**
 * Owner: grant a viewer by Clerk user id (already known — no Clerk lookup).
 * For grant-by-email, use the action `grantViewerByEmail`.
 */
export const grantViewer = mutation({
  args: {
    viewerClerkUserId: v.string(),
    viewerEmail: v.optional(v.string()),
    viewerDisplayName: v.optional(v.string()),
    appOrigin: v.optional(v.string())
  },
  returns: settingsValidator,
  handler: async (ctx, args) => {
    const owner = await requireCurrentUser(ctx);
    if (args.viewerClerkUserId === owner.clerkUserId) {
      throw new Error("Cannot grant access to yourself");
    }
    const viewer = await ensureUserRowByClerkId(ctx, args.viewerClerkUserId, {
      displayName: args.viewerDisplayName,
      email: args.viewerEmail
    });
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
        createdAt: Date.now()
      });
    }
    return await buildSettingsPayload(ctx, owner._id, args.appOrigin ?? null);
  }
});

/**
 * Owner: grant access by email. Looks up the viewer in Clerk, then delegates
 * to `grantViewer`. Must be an action (Clerk REST is an external fetch).
 */
export const grantViewerByEmail = action({
  args: { email: v.string(), appOrigin: v.optional(v.string()) },
  returns: v.union(
    settingsValidator,
    v.object({ error: v.string() })
  ),
  handler: async (ctx, args) => {
    const found = await findClerkUserByEmail(args.email);
    if (!found.ok) return { error: found.error };
    return await ctx.runMutation(api.sharing.grantViewer, {
      viewerClerkUserId: found.clerkUserId,
      viewerEmail: found.emailAddress,
      viewerDisplayName: [found.firstName, found.lastName].filter(Boolean).join(" ").trim(),
      appOrigin: args.appOrigin
    });
  }
});

/**
 * Viewer accepts an invite token. Resolves token to owner, then creates the
 * grant (owner → viewer). Token must belong to an enabled-sharing owner.
 */
export const acceptInvite = mutation({
  args: { token: v.string() },
  returns: v.object({ ok: v.boolean(), ownerClerkUserId: v.string(), label: v.string() }),
  handler: async (ctx, args) => {
    const viewer = await requireCurrentUser(ctx);
    const token = args.token.trim();
    if (!token) throw new Error("Missing token");

    const settings = await ctx.db
      .query("shareSettings")
      .withIndex("by_invite_token", (q) => q.eq("inviteToken", token))
      .unique();
    if (!settings || !settings.enabled) {
      throw new Error("Invalid or expired invite link.");
    }
    const owner = await ctx.db.get(settings.userId);
    if (!owner) throw new Error("Invalid invite link.");
    if (owner.clerkUserId === viewer.clerkUserId) {
      throw new Error("That invite is for your own account.");
    }

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
        createdAt: Date.now()
      });
    }

    const label = (owner.displayName?.trim() || owner.email?.trim() || `User ${owner.clerkUserId.slice(0, 8)}…`);
    return { ok: true, ownerClerkUserId: owner.clerkUserId, label };
  }
});

/**
 * Viewer: list owners who shared their diary with me (enabled = true).
 * Returns the same shape /api/shared-diaries returned: { items: [{ ownerId, label }] }.
 * `ownerId` here is the Clerk user id, not the Convex doc id (preserves
 * existing client expectations).
 */
export const listSharedDiaries = query({
  args: {},
  returns: v.object({
    items: v.array(v.object({ ownerId: v.string(), label: v.string() }))
  }),
  handler: async (ctx) => {
    /** Tolerate no users row yet (see `getSettings` for context). */
    const viewer = await getCurrentUserOrNull(ctx);
    if (!viewer) return { items: [] };
    const grants = await ctx.db
      .query("shareGrants")
      .withIndex("by_viewer", (q) => q.eq("viewerUserId", viewer._id))
      .collect();
    grants.sort((a, b) => a.createdAt - b.createdAt);

    const items: { ownerId: string; label: string }[] = [];
    for (const g of grants) {
      const settings = await ctx.db
        .query("shareSettings")
        .withIndex("by_user", (q) => q.eq("userId", g.ownerUserId))
        .unique();
      if (!settings?.enabled) continue;
      const owner = await ctx.db.get(g.ownerUserId);
      if (!owner) continue;
      const custom = (settings.shareDisplayName ?? "").trim();
      const label = custom || owner.displayName?.trim() || owner.email?.trim() || `User ${owner.clerkUserId.slice(0, 8)}…`;
      items.push({ ownerId: owner.clerkUserId, label });
    }
    return { items };
  }
});

/**
 * Viewer: read someone's diary. Verifies grant + enabled + caller is not owner.
 * Returns entries in the legacy shape (id from entryId, ISO timestamps).
 */
export const getSharedDiary = query({
  args: { ownerClerkUserId: v.string() },
  returns: v.object({
    ownerId: v.string(),
    diary: v.array(v.any())
  }),
  handler: async (ctx, args) => {
    const viewer = await requireCurrentUser(ctx);
    if (args.ownerClerkUserId === viewer.clerkUserId) {
      throw new Error("Use your own diary endpoints for your data");
    }
    const owner = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.ownerClerkUserId))
      .unique();
    if (!owner) throw new Error("Forbidden");

    const grant = await ctx.db
      .query("shareGrants")
      .withIndex("by_owner_and_viewer", (q) =>
        q.eq("ownerUserId", owner._id).eq("viewerUserId", viewer._id)
      )
      .unique();
    if (!grant) throw new Error("Forbidden");

    const settings = await ctx.db
      .query("shareSettings")
      .withIndex("by_user", (q) => q.eq("userId", owner._id))
      .unique();
    if (!settings?.enabled) throw new Error("Forbidden");

    const entries = await ctx.db
      .query("diaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", owner._id))
      .collect();

    return {
      ownerId: owner.clerkUserId,
      diary: entries.map((d) => ({
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
      }))
    };
  }
});

/**
 * Owner-side preview action used to backfill Clerk display names for grants
 * that pre-date this app capturing displayName/email. Safe no-op if all
 * already labeled. Call sparingly.
 */
export const refreshGrantLabels = action({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx) => {
    // No direct mutation here — schedule a background refresh per grant.
    // Implementation deferred; placeholder returns 0 to keep API stable.
    void ctx;
    void fetchClerkUserLabel;
    return { updated: 0 };
  }
});
