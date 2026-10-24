import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // scripts/serve.sh builds into a spare folder and swaps, so a running demo is only down for a moment.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Native/WASM server deps stay out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "@solana/web3.js", "@solana/spl-token", "bcryptjs"],
  outputFileTracingIncludes: { "/api/**": ["./lib/schema.sql"] },
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    // No third-party scripts, trackers or analytics anywhere in the app.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
