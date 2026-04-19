"use client";

import { ClerkProvider } from "@clerk/nextjs";

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
      {children}
    </ClerkProvider>
  );
}
