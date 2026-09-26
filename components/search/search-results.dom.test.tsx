import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import { climbSearchItems } from "@/lib/search";

import { SearchResults } from "./search-results";

it("shows community ratings and ascent counts from search data, including unrated climbs", () => {
  const items = climbSearchItems({
    climbs: [
      {
        id: 1,
        areaId: 1,
        areaName: "Cedar",
        name: "Arete",
        type: "sport",
        grade: 20,
        brokenOn: null,
      },
      {
        id: 2,
        areaId: 1,
        areaName: "Cedar",
        name: "Slab",
        type: "boulder",
        grade: 3,
        brokenOn: null,
      },
    ],
    sendStats: { 1: { avgRating: 4.5, sendCount: 12, avgSuggestedGrade: null } },
    areaBreadcrumbs: {},
    hasNextPage: false,
  });
  render(
    <SearchResults
      sections={[{ kind: "climb", status: "ready", items }]}
      onSelect={() => {}}
      onRetry={() => {}}
    />,
  );
  expect(screen.getByText("4.5")).toBeInTheDocument();
  expect(screen.getByText("12 ascents")).toBeInTheDocument();
  expect(screen.getByText("0 ascents")).toBeInTheDocument();
  expect(screen.getByText("—")).toBeInTheDocument();
  expect(screen.getByText("Sport")).toBeInTheDocument();
  expect(screen.getByText("Boulder")).toBeInTheDocument();
});

it("lists page results as items, but keeps the combobox branch as options", () => {
  const items = climbSearchItems({
    climbs: [
      {
        id: 1,
        areaId: 1,
        areaName: "Cedar",
        name: "Arete",
        type: "sport",
        grade: 20,
        brokenOn: null,
      },
      {
        id: 2,
        areaId: 1,
        areaName: "Cedar",
        name: "Slab",
        type: "boulder",
        grade: 3,
        brokenOn: null,
      },
    ],
    sendStats: {},
    areaBreadcrumbs: {},
    hasNextPage: false,
  });
  const sections = [{ kind: "climb" as const, status: "ready" as const, items }];
  const { rerender } = render(
    <SearchResults sections={sections} onSelect={() => {}} onRetry={() => {}} />,
  );
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByRole("button", { name: /^Open Arete,/ })).toBeInTheDocument();

  rerender(
    <SearchResults
      sections={sections}
      onSelect={() => {}}
      onRetry={() => {}}
      listboxId="results"
      activeId={null}
    />,
  );
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(2);
});
