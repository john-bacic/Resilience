import { clerkClient } from "@clerk/nextjs/server";

const MAX_USERS = 500;
const PAGE_SIZE = 100;

function primaryEmail(u) {
  const primary =
    u.emailAddresses?.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
    u.emailAddresses?.[0]?.emailAddress;
  return primary ? String(primary).trim().toLowerCase() : "";
}

function labelFromUser(u) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  const em = primaryEmail(u);
  if (em) return em;
  if (u.username) return u.username;
  return `${u.id.slice(0, 8)}…`;
}

/**
 * Paginated list of Clerk users with an email (for share allowlist picker).
 * Capped for performance; sorted by email.
 */
export async function listRegisteredUsersForSharingPicker() {
  const client = await clerkClient();
  const rows = [];
  let offset = 0;

  while (rows.length < MAX_USERS) {
    const res = await client.users.getUserList({
      limit: PAGE_SIZE,
      offset
    });
    const batch = res.data ?? [];
    if (batch.length === 0) break;

    for (const u of batch) {
      if (u.banned) continue;
      const email = primaryEmail(u);
      if (!email) continue;
      rows.push({
        userId: u.id,
        email,
        label: labelFromUser(u)
      });
    }

    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  rows.sort((a, b) => a.email.localeCompare(b.email));
  return rows;
}
