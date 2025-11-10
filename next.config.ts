import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['inngest', '@inngest/agent-kit'],
}

export default nextConfig;
