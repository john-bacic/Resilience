import { auth } from "@clerk/nextjs/server";

/** @returns {{ userId: string } | { response: Response }} */
export async function requireAuthUserId() {
  const { userId } = await auth();
  if (!userId) {
    return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId };
}
