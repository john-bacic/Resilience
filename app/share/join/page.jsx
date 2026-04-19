"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function JoinInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token?.trim()) {
      setStatus("error");
      setMessage("This invite link is missing a token. Ask the person who shared for a current link or QR code.");
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/me/sharing/accept-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.trim() })
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok) {
          setStatus("ok");
          setMessage(
            typeof data?.label === "string" && data.label
              ? `You can open ${data.label}'s diary from Shared diaries below.`
              : "You now have access. Open Shared diaries on the home page to view their diary."
          );
        } else if (response.status === 401) {
          setStatus("auth");
          setMessage("Sign in (or create an account) with the email you use for this app, then open this link again.");
        } else {
          setStatus("error");
          setMessage(typeof data?.error === "string" ? data.error : "Could not accept this invite.");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Something went wrong. Try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

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
      {status === "auth" ? (
        <>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{message}</p>
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(`/share/join?t=${encodeURIComponent(token || "")}`)}`}
            className="mt-6 inline-flex justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Sign in
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
