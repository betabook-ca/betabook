import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { useEffect, useState } from "react";

import { AreaClimbsToolbar } from "@/components/filters/area-climbs-toolbar";
import { JournalFilterToolbar } from "@/components/filters/journal-filter-toolbar";
import { UserSendsFilterToolbar } from "@/components/filters/sends-filter-toolbar";
import { parseAreaClimbsFilter, parseAreaClimbsSort } from "@/lib/filters/area-climbs-filter";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { searchAreaFetcher } from "@/stories/fixtures/app-search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

/** Render production controls; intercept only navigation at the gallery boundary. */
export function FilterToolbarDemo({ list = "sends" }: { list?: "sends" | "journal" | "area" }) {
  const base = list === "journal" ? "/users/sample/journal" : `/sample/${list}`;
  const [href, setHref] = useState(base);
  const search = new URL(href, "https://storybook.example").searchParams;
  const params = Object.fromEntries(
    Array.from(new Set(search.keys()), (key) => [key, search.getAll(key)]),
  );
  useEffect(() => {
    const router = getRouter();
    router.replace.mockImplementation((next: string) => setHref(next));
    router.push.mockImplementation((next: string) => setHref(next));
    return () => {
      router.replace.mockReset();
      router.push.mockReset();
    };
  }, []);
  return (
    <StoryPage
      title={`${list === "area" ? "Area climbs" : list === "journal" ? "Journal" : "Sends"} filters`}
      description="Production toolbar with local navigation. Filter and sort changes update the sample URL below; no account data or live results are loaded."
    >
      <div
        onClickCapture={(event) => {
          const link = event.target instanceof Element ? event.target.closest("a") : null;
          const next = link?.getAttribute("href");
          if (next?.startsWith(base)) {
            event.preventDefault();
            setHref(next);
          }
        }}
      >
        {list === "sends" ? (
          <UserSendsFilterToolbar
            filter={parseUserSendsFilter(params)}
            basePath={base}
            tags={["power", "trip"]}
            areaFetcher={searchAreaFetcher}
          />
        ) : list === "journal" ? (
          <JournalFilterToolbar
            userId="sample"
            filter={parseJournalFilter(params)}
            climbName={null}
            tags={["power", "trip"]}
          />
        ) : (
          <AreaClimbsToolbar
            areaPath={base}
            filter={parseAreaClimbsFilter(params)}
            sort={parseAreaClimbsSort(params)}
          />
        )}
      </div>
      <output aria-label="Sample navigation" className="text-xs break-all">
        {href}
      </output>
    </StoryPage>
  );
}
