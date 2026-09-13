import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { climbSearchItems } from "@/lib/search";

import { SearchResults } from "./search-results";

it("shows community ratings and ascent counts from search data, including unrated climbs", () => {
  const items = climbSearchItems({
    climbs: [
      { id: 1, areaId: 1, areaName: "Cedar", name: "Arete", type: "sport", grade: 20 },
      { id: 2, areaId: 1, areaName: "Cedar", name: "Slab", type: "boulder", grade: 3 },
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
