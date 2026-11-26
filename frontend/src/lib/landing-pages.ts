/** Public product pages: indexable, listed in the sitemap, and reachable
 * before a member accepts updated terms. */
export type LandingPageLink = { path: string; label: string; description: string };

export const LOGBOOK_PAGE: LandingPageLink = {
  path: "/climbing-logbook",
  label: "Climbing logbook features",
  description: "Sends, journal, projects, analytics and friends.",
};

export const IMPORT_PAGES = {
  kaya: {
    path: "/kaya-import",
    label: "Import from KAYA",
    description: "Load a public KAYA profile, or upload KAYA’s CSV export.",
  },
  sendage: {
    path: "/sendage-import",
    label: "Import from Sendage",
    description: "Load a public Sendage profile, or upload Sendage’s CSV export.",
  },
  mountainProject: {
    path: "/mountain-project-import",
    label: "Import from Mountain Project",
    description: "Load your Mountain Project ticks, or upload their CSV export.",
  },
} satisfies Record<string, LandingPageLink>;

export type ImportPageSource = keyof typeof IMPORT_PAGES;

export const COSTS_PAGE: LandingPageLink = {
  path: "/costs",
  label: "Cost transparency",
  description: "This month’s Cloudflare usage and what Betabook costs to run.",
};

export const LANDING_PAGE_PATHS = [
  LOGBOOK_PAGE.path,
  ...Object.values(IMPORT_PAGES).map((page) => page.path),
  COSTS_PAGE.path,
];
