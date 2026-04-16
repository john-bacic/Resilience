import { auth } from "@clerk/nextjs/server";

/** @returns {{ userId: string } | { response: Response }} */
export async function requireAuthUserId() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    return { userId };
  } catch (error) {
    console.error("[requireAuthUserId] Clerk auth() failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      response: Response.json(
        { error: "Authentication unavailable", detail: message },
        { status: 503 }
      )
    };
  }
}
