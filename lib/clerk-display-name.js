import { clerkClient } from "@clerk/nextjs/server";

/** Best-effort label for a Clerk user id (for shared diary lists). */
export async function getClerkUserLabel(userId) {
  try {
    const client = await clerkClient();
    const u = await client.users.getUser(userId);
    const primary =
      u.emailAddresses?.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
      u.emailAddresses?.[0]?.emailAddress;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (primary) return primary;
    if (u.username) return u.username;
  } catch {
    // ignore
  }
  return `User ${userId.slice(0, 8)}…`;
}
