"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const clerkAppearance = {
  variables: {
    colorPrimary: "#6b7280"
  },
  elements: {
    userButtonTrigger: {
      color: "#374151"
    },
    userButtonAvatarBox: {
      boxShadow: "0 0 0 1px #9ca3af inset",
      backgroundColor: "#9ca3af"
    }
  }
};

/**
 * Convex client (browser-only). `NEXT_PUBLIC_CONVEX_URL` is written by
 * `npx convex dev` and `npx convex deploy`. We always instantiate a
 * client (even with a placeholder URL) so hooks like `useMutation` don't
 * throw at render time if the env var is missing in some environment.
 * Real calls just fail silently and our dual-write `.catch` handles it.
 */
const convexClient = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL || "https://placeholder.convex.cloud"
);

/** Align Clerk redirect validation with NEXT_PUBLIC_APP_URL (Vercel / custom domain). */
const allowedRedirectOrigins = (() => {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return [`${u.protocol}//${u.host}`];
  } catch {
    return undefined;
  }
})();

export default function AppProviders({ children }) {
  return (
    <ClerkProvider
      dynamic
      appearance={clerkAppearance}
      {...(allowedRedirectOrigins ? { allowedRedirectOrigins } : {})}
    >
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
