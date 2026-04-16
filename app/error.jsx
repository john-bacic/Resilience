"use client";

export default function Error({ error, reset }) {
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
      {process.env.NODE_ENV === "development" && error?.message ? (
        <pre className="max-w-lg overflow-auto text-xs text-red-600 dark:text-red-400">{error.message}</pre>
      ) : null}
    </div>
  );
}
