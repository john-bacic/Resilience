"use client";

function formatCaughtError(error) {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || String(error);
  if (typeof Event !== "undefined" && error instanceof Event) {
    return `DOM Event (${error.type}) — often caused by a <button> without type="button" inside a <form>.`;
  }
  if (typeof error === "object" && error !== null) {
    const msg = "message" in error && typeof error.message === "string" ? error.message : "";
    const digest = "digest" in error && typeof error.digest === "string" ? error.digest : "";
    if (msg || digest) return [msg, digest ? `digest: ${digest}` : ""].filter(Boolean).join(" · ");
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export default function Error({ error, reset }) {
  const detail = formatCaughtError(error);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <p className="text-center text-sm text-slate-600 dark:text-slate-300">Something went wrong loading the app.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
      >
        Try again
      </button>
      {process.env.NODE_ENV === "development" && detail ? (
        <pre className="max-w-lg overflow-auto text-xs text-red-600 dark:text-red-400">{detail}</pre>
      ) : null}
    </div>
  );
}
