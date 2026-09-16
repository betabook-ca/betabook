import { clsx } from "clsx";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingHero } from "@/components/landing-page";
import { AppSearch } from "@/components/search/app-search";
import { CARD_PADDING } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/typography";
import { LOGBOOK_PAGE } from "@/lib/landing-pages";
import { parseSearchState } from "@/lib/search";
import { loadClimberSuggestions, loadSearch, loadAreaSelection } from "@/lib/search-loader";
import { pageMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { signUpUrl } from "@/lib/sign-in-redirect";
import type { UrlParamsRecord } from "@/lib/url-params";

type SearchPageProps = {
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  // Any param at all is a search/filter state (see the page body) — infinite
  // and low-value as a landing page, so it's kept out of the index and
  // canonicalized to the bare, unfiltered search page.
  const isSearch = Object.keys(await searchParams).length > 0;
  return isSearch
    ? { title: "Search", robots: { index: false }, alternates: { canonical: "/" } }
    : pageMetadata({
        // The layout's title template skips its own segment, so the root page names the brand itself.
        title: "Betabook · Free climbing logbook and crag database",
        description:
          "Search routes and boulder problems, and log your sends and sessions for bouldering, sport and trad.",
        path: "/",
      });
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const isBare = Object.keys(params).length === 0;
  const session = await getMemberSession();
  if (isBare && session) redirect(`/users/${session.user.id}`);
  const state = parseSearchState(params);
  state.area = await loadAreaSelection(state.filter.areaId);
  const viewerId = session?.user.id ?? null;
  const [initial, suggestions] = await Promise.all([
    loadSearch(state, viewerId),
    loadClimberSuggestions(state, viewerId),
  ]);
  return (
    <div className={clsx("flex flex-col gap-6", !session && CARD_PADDING.fluid)}>
      {/* Members are redirected from the bare page, so its intro carries the
       * sign-up in place of the search's member notice. */}
      {isBare ? (
        <>
          <LandingHero
            title="A free climbing logbook and crag database"
            lead="Log bouldering, sport and trad sends and sessions, and search routes and problems below."
            actions={[
              { href: signUpUrl(), label: "Create a free account" },
              { href: LOGBOOK_PAGE.path, label: "How Betabook works" },
            ]}
          />
          <SectionHeading className="mt-2">Search climbs and areas</SectionHeading>
        </>
      ) : (
        <h1 className="text-2xl font-semibold">Search</h1>
      )}
      <AppSearch
        initialState={state}
        initial={initial}
        suggestions={suggestions}
        viewerId={viewerId}
        showMemberNotice={!isBare}
      />
    </div>
  );
}
