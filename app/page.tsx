import type { Metadata } from "next";
import { permanentRedirect, redirect } from "next/navigation";

import { SearchView } from "@/app/search-view";
import { LandingHero } from "@/components/landing-page";
import { CARD_PADDING } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/typography";
import { LOGBOOK_PAGE } from "@/lib/landing-pages";
import { SEARCH_PATH } from "@/lib/search";
import { pageMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { signUpUrl } from "@/lib/sign-in-redirect";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

type HomePageProps = {
  searchParams: Promise<UrlParamsRecord>;
};

const HOME_TITLE = "Betabook · Free climbing logbook and crag database";

export async function generateMetadata({ searchParams }: HomePageProps): Promise<Metadata> {
  // Any param is a search state that redirects to /search; keep it out of the
  // index and canonicalized to the bare home.
  const isSearch = Object.keys(await searchParams).length > 0;
  return isSearch
    ? { title: { absolute: "Search" }, robots: { index: false }, alternates: { canonical: "/" } }
    : {
        ...pageMetadata({
          title: HOME_TITLE,
          description:
            "Search routes and boulder problems, and log your sends and sessions for bouldering, sport and trad.",
          path: "/",
        }),
        // The root page names the brand itself, so it must not take the
        // layout's template. Next skips a template in its own segment but
        // vinext applies the root layout's to this page; `absolute` opts out
        // under both.
        title: { absolute: HOME_TITLE },
      };
}

/** `/?…` links land on /search permanently, with the query intact. */
function searchRedirectHref(params: UrlParamsRecord): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of toArray(value)) query.append(key, item);
  }
  return `${SEARCH_PATH}?${query}`;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  if (Object.keys(params).length > 0) permanentRedirect(searchRedirectHref(params));
  const session = await getMemberSession();
  if (session) redirect(`/users/${session.user.id}`);
  return (
    <div className={`flex flex-col gap-6 ${CARD_PADDING.fluid}`}>
      {/* Members are redirected, so the intro carries the sign-up in place of
       * the search's member notice. */}
      <LandingHero
        title="A free climbing logbook and crag database"
        lead="Log bouldering, sport and trad sends and sessions, and search routes and problems below."
        actions={[
          { href: signUpUrl(), label: "Create a free account" },
          { href: LOGBOOK_PAGE.path, label: "How Betabook works" },
        ]}
      />
      <SectionHeading className="mt-2">Search climbs and areas</SectionHeading>
      <SearchView params={params} viewerId={null} defaultCategory="all" showMemberNotice={false} />
    </div>
  );
}
