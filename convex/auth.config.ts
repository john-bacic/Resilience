/**
 * Clerk → Convex JWT bridge.
 *
 * Required setup (one-time, in Clerk dashboard):
 *   1. Clerk → JWT Templates → "New template" → choose "Convex".
 *   2. Copy the Issuer URL it generates (e.g. https://your-app.clerk.accounts.dev).
 *   3. Set `CLERK_JWT_ISSUER_DOMAIN` in Convex env (`npx convex env set`).
 *
 * The applicationID `"convex"` matches the default Clerk Convex template.
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex"
    }
  ]
};
