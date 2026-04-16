"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";

export default function ClerkHeader() {
  const { isSignedIn, isLoaded } = useAuth();

  return (
    <header className="flex min-h-[48px] items-center justify-end gap-2 bg-slate-100 px-4 py-2 md:px-8 dark:bg-slate-950">
      {!isLoaded ? (
        <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800" aria-hidden />
      ) : isSignedIn ? (
        <UserButton afterSignOutUrl="/sign-in" />
      ) : (
        <>
          <Link
            href="/sign-in"
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Sign up
          </Link>
        </>
      )}
    </header>
  );
}
