import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Avoid Next inferring a parent folder as the workspace root when another lockfile exists (e.g. ~/package-lock.json).
  outputFileTracingRoot: path.join(__dirname),
  // Next 15 dev: segment explorer can break RSC ("SegmentViewNode" / client manifest) and surface as 500 in dev.
  experimental: {
    devtoolSegmentExplorer: false
  }
};

export default nextConfig;
