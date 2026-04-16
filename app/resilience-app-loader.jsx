"use client";

import dynamic from "next/dynamic";

const ResilienceApp = dynamic(() => import("@/components/resilience-app"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-10 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
      Loading your resilience app...
    </div>
  )
});

export default function ResilienceAppLoader() {
  return <ResilienceApp />;
}
