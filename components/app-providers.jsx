"use client";

import { ClerkProvider } from "@clerk/nextjs";

const clerkAppearance = {
  variables: {
    colorPrimary: "#0f172a"
  }
};

export default function AppProviders({ children }) {
  return (
    <ClerkProvider dynamic appearance={clerkAppearance}>
      {children}
    </ClerkProvider>
  );
}
