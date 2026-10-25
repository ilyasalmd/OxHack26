import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // scripts/serve.sh builds into a spare folder and swaps, so a running demo is only down for a moment.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The hosted copy sets this to the commit: a tab opened before a deploy then reloads on its
  // next navigation instead of asking for script files the new build no longer has.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  // Native/WASM server deps stay out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "@solana/web3.js", "@solana/spl-token", "bcryptjs"],
  outputFileTracingIncludes: { "/api/**": ["./lib/schema*.sql"] },
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
          // Our own pages may use the microphone (voice notes) and camera (photos); nothing embedded may.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
