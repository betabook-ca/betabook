import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { AppMenuButton } from "@/components/app-menu";
import { AppTabBar } from "@/components/app-tab-bar";
import { BrandHomeLink } from "@/components/brand";
import { SearchPaletteProvider, SearchTrigger } from "@/components/command-palette";
import { HeaderAuthLinks } from "@/components/header-auth-links";
import { HeaderLogButton } from "@/components/header-log-button";
import { MobileAppHelper } from "@/components/mobile-app-helper";
import { SearchScopeProvider } from "@/components/search-scope";
import { AppLink } from "@/components/ui/app-link";
import { JsonLd } from "@/components/ui/json-ld";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { LOGBOOK_PAGE } from "@/lib/landing-pages";
import { websiteJsonLd } from "@/lib/seo";
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

import { Providers } from "./providers";

import "./globals.css";

// The guidebook display voice — see --font-display in globals.css. Vendored
// woff2 (latin subset, the two weights the display roles use) rather than
// next/font/google: the Google loader downloads at build time and aborts the
// build in a sandboxed/offline environment — the same condition that moved
// Geist to package assets.
const barlowCondensed = localFont({
  src: [
    { path: "../assets/fonts/barlow-condensed-600-latin.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/barlow-condensed-700-latin.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
  // Condensed faces shift layout hard on fallback; metric-adjusted Arial
  // keeps the swap from reflowing the wordmark and titles.
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  // Absolute base for canonical/OG URLs — per-page metadata can then use
  // site-relative paths and Next resolves them against this.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  interactiveWidget: "resizes-content",
  // Matches --background per theme (globals.css: paper in light, ink in
  // dark), so the browser chrome follows the app instead of staying light
  // on the dark theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eaf7ef" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Rendered as a PLAIN inline <script> at the top of <body> — deliberately
// not next/script: in the App Router, `beforeInteractive` is queued into
// self.__next_s and only executed right before hydration, i.e. after the
// bundle downloads — far too late to stop a light-themed first paint. A
// plain parser-executed script runs before any following content paints.
// Mirrors @heroui/react useTheme()'s storage key and resolution exactly
// (see use-theme.js). Also pins the browser-chrome theme-color for an
// explicit theme choice — the static media-query metas only track the OS
// preference (keep the colors and logic in sync with lib/theme-color.ts).
const SET_THEME_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("heroui-theme") || "system";
    var resolved =
      theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
    document.documentElement.classList.add(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
    if (theme !== "system") {
      var m = document.createElement("meta");
      m.name = "theme-color";
      m.content = resolved === "dark" ? "#000000" : "#eaf7ef";
      m.setAttribute("data-explicit-theme", "");
      document.head.appendChild(m);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${barlowCondensed.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/* oxlint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: SET_THEME_SCRIPT }} />
        <JsonLd data={websiteJsonLd()} />
        <a
          href="#main"
          // oxlint-disable-next-line tailwindcss/no-conflicting-classes
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:text-foreground"
        >
          Skip to content
        </a>
        <Providers>
          {/* Wraps everything below the providers: the palette reads the
           * scope, and the pages that set it are rendered as children. */}
          <SearchScopeProvider>
            {/* Inside the scope provider, which the palette reads, and around
             * the page, whose own search entry opens the same palette. */}
            <SearchPaletteProvider>
              <header className="border-b border-separator px-4 py-3">
                <div className={`mx-auto flex w-full ${PAGE_MAX_WIDTH_CLASS} items-center gap-2`}>
                  <AppMenuButton />
                  <BrandHomeLink />
                  <div className="ms-auto flex items-center gap-3">
                    <HeaderLogButton />
                    <SearchTrigger />
                    <HeaderAuthLinks />
                  </div>
                </div>
              </header>
              {/* tabIndex lets the skip link move focus here, not just scroll. */}
              <main id="main" tabIndex={-1} className="flex-1 p-4 outline-none">
                <div className={`mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`}>{children}</div>
              </main>
              <footer className="border-t border-separator px-4 py-4 text-sm text-muted">
                {/* Same rail as the header's inner div. Plain AppLink, not
                 * NavLink: footer links have no current-state treatment, so
                 * aria-current would announce a state the design doesn't show. */}
                <div
                  className={`mx-auto flex w-full ${PAGE_MAX_WIDTH_CLASS} flex-wrap items-center justify-between gap-2`}
                >
                  <span>
                    {/* oxlint-disable-next-line node/no-process-env */}
                    &copy; {process.env.NEXT_PUBLIC_BUILD_YEAR} {SITE_NAME} —{" "}
                    <span className="whitespace-nowrap">{SITE_TAGLINE}</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-4">
                    <AppLink href={LOGBOOK_PAGE.path}>Features</AppLink>
                    <AppLink href="/about">About</AppLink>
                    <AppLink href="/contact">Contact</AppLink>
                    <AppLink href="/terms">Terms of Service</AppLink>
                  </div>
                </div>
              </footer>
              <AppTabBar />
              <MobileAppHelper />
            </SearchPaletteProvider>
          </SearchScopeProvider>
        </Providers>
      </body>
    </html>
  );
}
