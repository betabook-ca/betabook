import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The development badge overlaps the app's mobile tab bar and intercepts taps.
  devIndicators: false,
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
  // `next dev` serves /_next dev resources only to the host it started with,
  // 403ing everything else — which breaks opening it from a phone on the LAN.
  // No effect on a production build.
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
  env: {
    // Inlined at build time — the footer's copyright year must not come from
    // a runtime `new Date()` in the root layout, which would block making the
    // shell fully prerenderable (cacheComponents) later.
    NEXT_PUBLIC_BUILD_YEAR: String(new Date().getFullYear()),
  },
  async headers() {
    return [
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

void initOpenNextCloudflareForDev();

export default nextConfig;
