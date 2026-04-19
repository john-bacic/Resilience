import { listRegisteredUsersForSharingPicker } from "@/lib/list-clerk-users-for-sharing";
import { requireAuthUserId } from "@/lib/require-auth";

/** Signed-in users: list registered Clerk accounts (email + label) for the grant picker. Excludes the current user. */
export async function GET() {
  const authResult = await requireAuthUserId();
  if ("response" in authResult) return authResult.response;
  const { userId } = authResult;

  try {
    const users = await listRegisteredUsersForSharingPicker();
    const filtered = users.filter((u) => u.userId !== userId);
    return Response.json({ users: filtered });
  } catch (error) {
    console.error("GET /api/me/sharing/registered-users failed", error);
    return Response.json({ error: "Could not load registered users" }, { status: 500 });
  }
}
