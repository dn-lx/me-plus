import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@me-plus/contracts",
    "@me-plus/domain",
    "@me-plus/reasoning",
    "@me-plus/ui",
  ],
};

export default nextConfig;
