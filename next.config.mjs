import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Avoid Next inferring a parent folder as the workspace root when another lockfile exists (e.g. ~/package-lock.json).
  outputFileTracingRoot: path.join(__dirname)
};

export default nextConfig;
