import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { SearchSurface } from "./search-surface";
import type { SearchSection } from "./search-types";

const props = {
  query: " Missing & new ",
  category: "all" as const,
  onQueryChange: vi.fn<() => void>(),
  onCategoryChange: vi.fn<() => void>(),
  onSelect: vi.fn<() => void>(),
  onRetry: vi.fn<() => void>(),
  onViewAll: vi.fn<() => void>(),
  onAreaChange: vi.fn<() => void>(),
};

for (const quick of [false, true]) {
  it(`removes the idle placeholder (quick=${quick})`, () => {
    render(
      <SearchSurface
        {...props}
        quick={quick}
        query=""
        sections={[{ kind: "climb", status: "idle", items: [] }]}
      />,
    );
    expect(
      screen.queryByText("Search climbs, areas, or climbers by name."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add climb" })).not.toBeInTheDocument();
  });

  it(`offers creation after empty catalog results (quick=${quick})`, () => {
    render(
      <SearchSurface
        {...props}
        canCreate
        quick={quick}
        sections={[
          { kind: "climb", status: "ready", items: [] },
          { kind: "area", status: "ready", items: [] },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Add climb" })).toHaveAttribute(
      "href",
      "/climbs/new?name=Missing+%26+new",
    );
    expect(screen.getByRole("link", { name: "Add area" })).toHaveAttribute("href", "/areas/new");
  });
}

it.each(["idle", "loading", "error", "locked"] as const)(
  "does not offer creation for %s results",
  (status) => {
    const sections: SearchSection[] = [{ kind: "climb", status, items: [] }];
    render(<SearchSurface {...props} canCreate sections={sections} />);
    expect(screen.queryByRole("link", { name: "Add climb" })).not.toBeInTheDocument();
  },
);

it("preserves the selected area in the add climb link", () => {
  render(
    <SearchSurface
      {...props}
      canCreate
      area={{ id: "42", name: "Cedar", path: "North" }}
      sections={[{ kind: "climb", status: "ready", items: [] }]}
    />,
  );
  expect(screen.getByRole("link", { name: "Add climb" })).toHaveAttribute(
    "href",
    "/climbs/new?name=Missing+%26+new&areaId=42",
  );
});

it("does not offer creation for matching areas or a climber-only search", () => {
  render(
    <SearchSurface
      {...props}
      canCreate
      sections={[
        {
          kind: "area",
          status: "ready",
          items: [{ kind: "area", id: "42", name: "Cedar", detail: "North" }],
        },
        { kind: "climber", status: "ready", items: [] },
      ]}
    />,
  );
  expect(screen.getByRole("button", { name: "Open Cedar, North" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Add climb|Add area/ })).not.toBeInTheDocument();
});

for (const quick of [false, true]) {
  it(`keeps signed-out idle search empty (quick=${quick})`, () => {
    render(
      <SearchSurface
        {...props}
        quick={quick}
        query=""
        sections={[
          { kind: "climb", status: "idle", items: [] },
          { kind: "area", status: "idle", items: [] },
          { kind: "climber", status: "locked", items: [] },
        ]}
      />,
    );
    expect(screen.queryByText(/Start typing to find/)).not.toBeInTheDocument();
    expect(screen.queryByText("Sign in to view climbers.")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Climbs results" })).not.toBeInTheDocument();
  });
  it(`keeps signed-out empty results compact without creation links (quick=${quick})`, () => {
    render(
      <SearchSurface
        {...props}
        quick={quick}
        sections={[
          { kind: "climb", status: "ready", items: [] },
          { kind: "area", status: "ready", items: [] },
          { kind: "climber", status: "locked", items: [] },
        ]}
      />,
    );
    expect(screen.getByText("No matches. Try another name or clear a filter.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Add climb|Add area/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Climbs results" })).not.toBeInTheDocument();
  });
}
