import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import ClerkHeader from "@/components/clerk-header";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

/** Clerk’s server `ClerkProvider` reads request context; static prerender can 500 on Vercel. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "stoic as phuq",
  description: "30-day resilience training app",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <ClerkProvider dynamic>
          <ClerkHeader />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
