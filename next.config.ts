import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow a 5 MB file plus multipart overhead; routes enforce the 5 MB file limit.
  experimental: {serverActions: {bodySizeLimit: "6mb"}},
};

export default nextConfig;
