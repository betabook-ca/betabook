import type { NextConfig } from "next";

const securityHeaders = [
  // Every subdomain holds email records only. `preload` stays off: that list
  // is slow to leave.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // The development badge overlaps the app's mobile tab bar and intercepts taps.
  devIndicators: false,
  poweredByHeader: false,
  images: {
    // Better Auth stores Google's OpenID `picture` URL on the user row.
    // Keep the optimizer allowlist pinned to that provider rather than
    // accepting arbitrary remote URLs from a database-backed `src`.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  // The dev server rejects cross-origin requests for its dev resources from
  // any host but the one it started with — which breaks opening it from a
  // phone on the LAN. No effect on a production build.
  //
  // Exact hosts, never wildcards: Next matches `*` against any hostname
  // label, not an IPv4 octet, so `192.168.*.*` would also admit
  // `192.168.attacker.com`. Add yours via DEV_ORIGINS (comma-separated).
  allowedDevOrigins: [
    "192.168.50.242",
    // oxlint-disable-next-line node/no-process-env
    ...(process.env.DEV_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []),
  ],
  experimental: {
    serverActions: {
      // Profile photo uploads are the only action carrying a file. The
      // picker crops and re-encodes to a 512px square first, so a real
      // submission is well under 100 KB.
      //
      // Deliberately above MAX_PROFILE_PHOTO_BYTES (3 MiB) rather than equal
      // to it: this limit covers the whole raw request, so multipart
      // boundaries and part headers ride on top of the file. At 3mb a photo
      // exactly at the app's cap would be rejected by the framework with a
      // generic error instead of the sentence lib/profile-photo.ts writes.
      bodySizeLimit: "4mb",
    },
  },
  env: {
    // Inlined at build time — the footer's copyright year must not come from
    // a runtime `new Date()` in the root layout, which would block making the
    // shell fully prerenderable (cacheComponents) later.
    NEXT_PUBLIC_BUILD_YEAR: String(new Date().getFullYear()),
  },
  async headers() {
    return [
      // Next matches `/:path*` against the bare root too; vinext compiles it
      // to a pattern needing at least one segment, which would leave the
      // homepage without these. The explicit "/" rule is a no-op under Next.
      ...["/", "/:path*"].map((source) => ({ source, headers: securityHeaders })),
      {
        // The /api routes back the app's own "load more" fetches (feed,
        // search) and return JSON — never a search result. robots.txt is
        // Cloudflare-managed, so the header is how these stay out of the
        // index.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

export default nextConfig;
