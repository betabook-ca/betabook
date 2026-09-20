import type { Metadata } from "next";

import { formatGrade, type ClimbType } from "@/lib/grades";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";

/** Full per-page metadata fragment for an indexable content page.
 *
 * `openGraph` and `twitter` are OVERWRITTEN, not merged, by the nearest
 * segment that sets them (Next metadata merging rules), so a page that wants
 * a per-page title has to re-supply `siteName`, `twitter.card`, and —
 * verified — the OG image too: returning any `openGraph` object drops the
 * inherited root `opengraph-image` file. This is the one place that list
 * lives. */
export function pageMetadata(opts: {
  title: string;
  description: string;
  /** Site-relative, e.g. `/climbs/42/the-name` — resolved against `metadataBase`. */
  path: string;
  ogType?: "website" | "article";
}): Metadata {
  const { title, description, path, ogType = "website" } = opts;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: ogType,
      siteName: SITE_NAME,
      title,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

/** Link preview for a valid profile share link. No canonical or `og:url`:
 * crawlers that follow either fetch the plain profile, which names no one. */
export function sharedProfileMetadata(name: string): Metadata {
  const title = `${name} on ${SITE_NAME}`;
  const description = `${name} invited you to ${SITE_NAME}, a climbing logbook and crag database.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false },
    openGraph: { type: "profile", siteName: SITE_NAME, title, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

/** Link preview for a valid project share link. Callers must run the share
 * predicate before reaching for this: an unfurl bot is signed out, so a
 * Members or Friends link pasted into a public channel has to preview as
 * nothing rather than naming the climber and the climb to the room. No
 * canonical or `og:url`, for the same reason as the profile preview, and no
 * session notes — a preview is not a place to publish them. */
export function sharedProjectMetadata(name: string, climbName: string): Metadata {
  const title = `${name} is projecting ${climbName}`;
  const description = `Follow ${name}'s progress on ${climbName} on ${SITE_NAME}, a climbing logbook and crag database.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false },
    openGraph: { type: "article", siteName: SITE_NAME, title, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

/** The `max` nearest names joined nearest-last into a short location trail
 * for a meta description, e.g. "Squamish, Grand Wall Boulders, Superfly".
 * Capped because a full root-to-crag chain ("North America, Canada, …")
 * pushes the useful part of the sentence past where search engines truncate.
 * Breadcrumb and `containedInPlace` structured data still use the full
 * chain. */
export function locationTrail(names: string[], max = 3): string {
  return names.slice(-max).join(", ");
}

/** Metadata uses the same public catalog details for every viewer. */
type PublicClimbFacts = {
  name: string;
  type: ClimbType;
  grade: number | null;
  description?: string | null;
};
export function climbTitle(climb: PublicClimbFacts, areaName: string): string {
  const grade = formatGrade(climb.type, climb.grade);
  return `${climb.name}${grade === "—" ? "" : ` · ${grade}`} · ${areaName}`;
}
/** Ends catalog descriptions that have no text of their own. */
const CLIMB_FALLBACK = `Community rating and logged ascents on ${SITE_NAME}.`;
const AREA_FALLBACK = `Routes and boulder problems on ${SITE_NAME}.`;

export function climbDescription(climb: PublicClimbFacts, trail: string): string {
  const grade = formatGrade(climb.type, climb.grade);
  const detail = climb.description?.trim();
  const discipline = climb.type === "boulder" ? "boulder problem" : `${climb.type} route`;
  return `${climb.name} is a ${grade === "—" ? "" : `${grade} `}${discipline}${trail ? ` in ${trail}` : ""}. ${detail || CLIMB_FALLBACK}`;
}

/** `<title>` for an area page. */
export function areaTitle(name: string, parentName: string | null): string {
  return parentName ? `${name} climbing · ${parentName}` : `${name} climbing`;
}

/** `<meta name="description">` for an area page. */
export function areaDescription(name: string, trail: string, description?: string | null): string {
  const where = trail ? `${name}, ${trail}` : name;
  return `Explore climbing in ${where}. ${description?.trim() || AREA_FALLBACK}`;
}

type Crumb = { name: string; path: string };

/** schema.org BreadcrumbList — the one structured-data type with broad,
 * low-risk rich-result support here. `path` is site-relative. */
export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`,
    })),
  };
}

/** Sitewide WebSite node with a SearchAction, so Google can offer a
 * sitelinks search box that targets the home search. */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?name={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Nests ancestor names (root-first input) into a schema.org
 * `containedInPlace` chain and returns the nearest parent — that Place's
 * own `containedInPlace` is its parent, and so on up to the root. */
function containedInPlace(ancestorNames: string[]): Record<string, unknown> | undefined {
  let place: Record<string, unknown> | undefined;
  for (const name of ancestorNames) {
    place = { "@type": "Place", name, ...(place ? { containedInPlace: place } : {}) };
  }
  return place;
}

/** BreadcrumbList + a Place for an area page. */
export function areaJsonLd(args: {
  name: string;
  path: string;
  description: string;
  crumbs: Crumb[];
  ancestorNames: string[];
}): Record<string, unknown>[] {
  const parent = containedInPlace(args.ancestorNames);
  return [
    breadcrumbJsonLd(args.crumbs),
    {
      "@context": "https://schema.org",
      "@type": "Place",
      name: args.name,
      url: `${SITE_URL}${args.path}`,
      description: args.description,
      ...(parent ? { containedInPlace: parent } : {}),
    },
  ];
}

/** BreadcrumbList + a WebPage for a climb page. No AggregateRating/Review
 * markup: Google scopes rating rich results to specific types (a climb is
 * none of them) and self-serving rating markup risks a manual action. */
export function climbJsonLd(args: {
  name: string;
  path: string;
  description: string;
  crumbs: Crumb[];
}): Record<string, unknown>[] {
  return [
    breadcrumbJsonLd(args.crumbs),
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: args.name,
      url: `${SITE_URL}${args.path}`,
      description: args.description,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    },
  ];
}
