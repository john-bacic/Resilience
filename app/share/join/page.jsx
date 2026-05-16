"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

const APP_HIGHLIGHTS = [
  {
    title: "Rehearse hard moments",
    body: "Daily \u201Cwhat could go wrong\u201D scenarios pulled from real life — work, family, money, health — so you stop being blindsided."
  },
  {
    title: "Three-step practice",
    body: "Facts vs Story \u2192 Control filter \u2192 Chosen response. A short journaling flow that turns reactions into intentional moves."
  },
  {
    title: "See your patterns",
    body: "Mood shifts, recurring stories, and lessons surface over 30 days (or longer) so progress is visible, not just felt."
  },
  {
    title: "Private by default",
    body: "Your diary is yours. Sharing only happens when you generate an invite link or QR \u2014 like the one that brought you here."
  }
];

function JoinInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const { isLoaded: clerkLoaded, userId } = useAuth();
  const acceptInvite = useMutation(api.sharing.acceptInvite);

  useEffect(() => {
    if (!clerkLoaded) return undefined;
    if (!token?.trim()) {
      setStatus("error");
      setMessage("This invite link is missing a token. Ask the person who shared for a current link or QR code.");
      return undefined;
    }
    if (!userId) {
      setStatus("auth");
      setMessage("Sign in (or create an account) with the email you use for this app, then open this link again.");
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await acceptInvite({ token: token.trim() });
        if (cancelled) return;
        setStatus("ok");
        setMessage(
          typeof data?.label === "string" && data.label
            ? `You can open ${data.label}'s diary from Shared diaries below.`
            : "You now have access. Open Shared diaries on the home page to view their diary."
        );
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : "Could not accept this invite.";
        setStatus("error");
        setMessage(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, clerkLoaded, userId, acceptInvite]);

  const returnTo = `/share/join?t=${encodeURIComponent(token || "")}`;
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(returnTo)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;

  if (status === "auth") {
    return (
      <div className="mx-auto max-w-xl px-6 py-10 sm:py-14">
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
            You&apos;ve been invited
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Welcome to STOIC AF
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Someone shared their resilience diary with you. Create a free account to read it and
            (if you want) start your own 30-day practice.
          </p>

          <ul className="mt-6 space-y-3">
            {APP_HIGHLIGHTS.map((h) => (
              <li
                key={h.title}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/60"
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{h.body}</p>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-col gap-2">
            <Link
              href={signUpHref}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              Create account &amp; accept invite
            </Link>
            <Link
              href={signInHref}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              I already have an account
            </Link>
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
            After signing up you&apos;ll come back here automatically and access will be granted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-6 py-12 text-center">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Diary invite</h1>
      {status === "loading" ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Confirming access…</p>
      ) : null}
      {status === "ok" ? (
        <>
          <p className="mt-4 text-sm text-emerald-800 dark:text-emerald-200/90">{message}</p>
          <Link
            href="/"
            className="mt-6 inline-flex justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Back to app
          </Link>
        </>
      ) : null}
      {status === "error" ? (
        <>
          <p className="mt-4 text-sm text-rose-800 dark:text-rose-200/90">{message}</p>
          <Link
            href="/"
            className="mt-6 inline-flex justify-center rounded-2xl border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Home
          </Link>
        </>
      ) : null}
    </div>
  );
}

export default function ShareJoinPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Loading…
        </div>
      }
    >
      <JoinInviteContent />
    </Suspense>
  );
}
