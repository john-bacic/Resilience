/** Public origin for invite links and QR codes (no trailing slash). */
export function getAppOrigin() {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (typeof process.env.VERCEL_URL === "string" && process.env.VERCEL_URL.trim()
      ? `https://${process.env.VERCEL_URL.trim()}`
      : "");
  if (!explicit) return "";
  try {
    const u = new URL(explicit.includes("://") ? explicit : `https://${explicit}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}
