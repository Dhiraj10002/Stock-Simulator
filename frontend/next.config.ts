import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
    ] }];
  },
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
      {
        source: "/explore",
        destination: "/stocks",
        permanent: false,
      },
      {
        source: "/3d",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
