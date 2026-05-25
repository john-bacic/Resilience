import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import ResilienceApp from "@/components/resilience-app";
import SharePitch from "@/components/share-pitch";

/**
 * Root surface, auth-aware:
 *  - Signed-in users get the full app.
 *  - Signed-out users get the same marketing pitch served at /share/join (the
 *    "shared with other people" view a QR code points to), with sign-up /
 *    sign-in CTAs in place of the invite-accept button.
 *
 * Decision is made server-side via Clerk's `auth()` so there's no client flash
 * between pitch and app. After Clerk sign-up the user is redirected back to
 * `/` (see `app/sign-up/[[...sign-up]]/page.jsx`) and this branches into the
 * app cleanly.
 */
export default async function Page() {
  const { userId } = await auth();

  if (userId) {
    return <ResilienceApp />;
  }

  return (
    <SharePitch
      cta={
        <>
          <Link
            href="/sign-up"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            Sign up &amp; start
          </Link>
          <Link
            href="/sign-in"
            className="text-center text-xs text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
          >
            I already have an account
          </Link>
          <p className="mt-1 text-center text-[11px] text-slate-400 dark:text-slate-500">
            Free. Your diary stays private unless you share a link.
          </p>
        </>
      }
    />
  );
}
