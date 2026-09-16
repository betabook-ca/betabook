import type { Metadata } from "next";

import { SearchView } from "@/app/search-view";
import { getMemberSession } from "@/lib/session";
import type { UrlParamsRecord } from "@/lib/url-params";

// Every state of this page is a search or filter view — infinite and
// low-value as a landing page — so none of it is indexed. The bare home
// carries the crawlable description of search (see app/page.tsx).
export const metadata: Metadata = { title: "Find climbs", robots: { index: false } };

/** Opens on the climb list so a project hunter can browse by area, grade,
 * rating and ascents before typing a name. */
export default async function FindClimbsPage({
  searchParams,
}: {
  searchParams: Promise<UrlParamsRecord>;
}) {
  const [params, session] = await Promise.all([searchParams, getMemberSession()]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Find climbs</h1>
        <p className="text-sm text-muted">
          Browse an area by grade, rating and ascents, or search by name.
        </p>
      </div>
      <SearchView
        params={params}
        viewerId={session?.user.id ?? null}
        defaultCategory="climb"
        showMemberNotice
        memberNoticePlacement="top"
      />
    </div>
  );
}
