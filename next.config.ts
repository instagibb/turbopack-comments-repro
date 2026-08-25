import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    swcPlugins: [["swc-plugin-coverage-instrument", {}]],
  },
};

export default nextConfig;
