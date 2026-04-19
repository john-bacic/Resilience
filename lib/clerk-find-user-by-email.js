import { clerkClient } from "@clerk/nextjs/server";

/**
 * Resolve a single Clerk user by primary/verified email (exact match).
 * There is no "browse all users" API for privacy; the person must already have an account.
 */
export async function findUserIdByEmail(email) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({
      emailAddress: [normalized],
      limit: 10
    });
    if (!data?.length) {
      return {
        ok: false,
        error: "No account found with that email. They need to sign up to this app first."
      };
    }
    if (data.length > 1) {
      return {
        ok: false,
        error: "Several accounts share that email; revoke extras in Clerk or use Advanced (user id)."
      };
    }
    return { ok: true, userId: data[0].id, user: data[0] };
  } catch (e) {
    console.error("findUserIdByEmail failed", e);
    return { ok: false, error: "Could not look up that email. Try again." };
  }
}
