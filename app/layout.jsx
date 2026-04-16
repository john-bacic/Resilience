import { ClerkProvider } from "@clerk/nextjs";
import ClerkHeader from "@/components/clerk-header";
import "./globals.css";

/** Clerk’s server `ClerkProvider` reads request context; static prerender can 500 on Vercel. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "stoic as fuck",
  description: "30-day resilience training app",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider dynamic>
          <ClerkHeader />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
