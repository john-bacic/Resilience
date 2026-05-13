/**
 * Clerk REST helpers (run as Convex actions / actions-only paths).
 *
 * Convex env must have `CLERK_SECRET_KEY` set:
 *   npx convex env set CLERK_SECRET_KEY <sk_test_or_sk_live_...>
 */

const CLERK_API = "https://api.clerk.com/v1";

function clerkSecret(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("Missing CLERK_SECRET_KEY in Convex env");
  return key;
}

/** Best-effort label for a Clerk user id (mirrors lib/clerk-display-name.js). */
export async function fetchClerkUserLabel(clerkUserId: string): Promise<string> {
  if (!clerkUserId) return "Unknown";
  try {
    const res = await fetch(`${CLERK_API}/users/${encodeURIComponent(clerkUserId)}`, {
      headers: { Authorization: `Bearer ${clerkSecret()}` }
    });
    if (!res.ok) return `User ${clerkUserId.slice(0, 8)}…`;
    const u = (await res.json()) as {
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      primary_email_address_id?: string | null;
      email_addresses?: { id: string; email_address: string }[];
    };
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    if (name) return name;
    const primary =
      u.email_addresses?.find((e) => e.id === u.primary_email_address_id)?.email_address ??
      u.email_addresses?.[0]?.email_address;
    if (primary) return primary;
    if (u.username) return u.username;
  } catch {
    // ignore
  }
  return `User ${clerkUserId.slice(0, 8)}…`;
}

/** Find a single Clerk user by primary/verified email (exact match). */
export async function findClerkUserByEmail(
  email: string
): Promise<
  | { ok: true; clerkUserId: string; firstName?: string; lastName?: string; emailAddress?: string }
  | { ok: false; error: string }
> {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  try {
    const url = `${CLERK_API}/users?email_address=${encodeURIComponent(normalized)}&limit=10`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${clerkSecret()}` } });
    if (!res.ok) return { ok: false, error: "Could not look up that email. Try again." };
    const data = (await res.json()) as Array<{
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      email_addresses?: { email_address: string }[];
    }>;
    if (!Array.isArray(data) || data.length === 0) {
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
    const u = data[0];
    return {
      ok: true,
      clerkUserId: u.id,
      firstName: u.first_name ?? undefined,
      lastName: u.last_name ?? undefined,
      emailAddress: u.email_addresses?.[0]?.email_address
    };
  } catch (e) {
    console.error("findClerkUserByEmail failed", e);
    return { ok: false, error: "Could not look up that email. Try again." };
  }
}
