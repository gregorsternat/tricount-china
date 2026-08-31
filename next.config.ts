import type { NextConfig } from "next";

const productionOnlyHeaders =
  process.env.NODE_ENV === "production"
    ? [
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
      ]
    : [];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          ...productionOnlyHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
