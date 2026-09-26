import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/trade",
        destination: "/terminal",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
