import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/terminal",
        destination: "/stocks",
        permanent: false,
      },
      {
        source: "/trade",
        destination: "/stocks",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
