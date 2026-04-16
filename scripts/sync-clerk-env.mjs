#!/usr/bin/env node
/**
 * Pushes NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY from .env.local
 * to Vercel. Publishable → all envs; secret → production + preview only (Vercel forbids
 * --sensitive on development). Requires: npx vercel login, linked project.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function parseEnvFile(text) {
  const env = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

function vercelEnvAdd(name, value, target, extraArgs) {
  const args = [
    "vercel",
    "env",
    "add",
    name,
    target,
    "--force",
    ...extraArgs
  ];
  const r = spawnSync("npx", args, {
    cwd: resolve(process.cwd()),
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (r.status !== 0) {
    console.error((r.stderr || r.stdout || "").toString());
    process.exit(r.status ?? 1);
  }
}

const path = resolve(process.cwd(), ".env.local");
let raw;
try {
  raw = readFileSync(path, "utf8");
} catch {
  console.error("Missing .env.local — copy from .env.example and add Clerk keys.");
  process.exit(1);
}

const env = parseEnvFile(raw);
const pub = (env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "").trim();
const sec = (env.CLERK_SECRET_KEY || "").trim();

if (!pub || !sec) {
  console.error(
    "Add to .env.local (from https://dashboard.clerk.com → API Keys):\n" +
      "  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...\n" +
      "  CLERK_SECRET_KEY=sk_test_...\n" +
      "Then run: npm run vercel:sync-clerk"
  );
  process.exit(1);
}

const allTargets = ["production", "preview", "development"];
for (const t of allTargets) {
  vercelEnvAdd("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", pub, t, []);
}
for (const t of ["production", "preview"]) {
  vercelEnvAdd("CLERK_SECRET_KEY", sec, t, ["--sensitive"]);
}

console.log("Done. Redeploy: npx vercel --prod  (or push to git if CI deploys).");
