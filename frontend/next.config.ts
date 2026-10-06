import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/trade",
        destination: "/stocks",
        permanent: false,
      },
      {
        source: "/terminal",
        destination: "/stocks",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
