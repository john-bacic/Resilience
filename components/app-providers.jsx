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

export default function AppProviders({ children }) {
  return (
    <ClerkProvider dynamic appearance={clerkAppearance}>
      {children}
    </ClerkProvider>
  );
}
