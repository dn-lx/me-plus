import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@me-plus/contracts",
    "@me-plus/domain",
    "@me-plus/reasoning",
    "@me-plus/ui",
  ],
  outputFileTracingIncludes: {
    "/download": ["../../releases/android/*.json", "./releases/android/*.json"],
    "/": ["../../releases/android/*.json", "./releases/android/*.json"],
  },
  outputFileTracingExcludes: {
    "/*": ["../../releases/android/parts/**", "./releases/android/parts/**"],
  },
};

export default nextConfig;

