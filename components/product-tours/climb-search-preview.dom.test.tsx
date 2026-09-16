import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { DemoClimbSearch } from "./climb-search-preview";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<(href: string) => void>() }),
  usePathname: () => "/tutorial/journal/find-projects",
}));

const rows = () =>
  within(screen.getByRole("region", { name: "Climbs results" }))
    .getAllByRole("button", { name: /^Open / })
    .map(
      (row) =>
        row
          .getAttribute("aria-label")
          ?.replace(/^Open /, "")
          .split(",")[0],
    );

it("lists Pine Canyon by ascents and narrows it through discipline, filters and sort", async () => {
  const user = userEvent.setup();
  render(<DemoClimbSearch />);
  expect(screen.getByRole("button", { name: "Clear area Pine Canyon" })).toBeInTheDocument();
  expect(rows()).toEqual([
    "First Light",
    "Quiet Arete",
    "Canyon Corner",
    "The Long Way",
    "Moss Ladder",
    "Pine Needle Crack",
    "Shaded Traverse",
  ]);

  await user.click(screen.getByRole("button", { name: "Boulder" }));
  await waitFor(() => expect(rows()).not.toContain("Canyon Corner"));
  expect(rows()).toEqual([
    "First Light",
    "Quiet Arete",
    "The Long Way",
    "Moss Ladder",
    "Shaded Traverse",
  ]);

  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  await user.click(screen.getByRole("button", { name: /Min grade/ }));
  await user.click(await screen.findByRole("option", { name: "V4" }));
  await waitFor(() => expect(rows()).toEqual(["Quiet Arete", "The Long Way"]));

  await user.click(screen.getByRole("button", { name: /Sort by/ }));
  await user.click(await screen.findByRole("option", { name: "Rating" }));
  await waitFor(() => expect(rows()).toEqual(["The Long Way", "Quiet Arete"]));

  await user.click(
    screen.getByRole("button", { name: "Open The Long Way, Sample Range / Pine Canyon" }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Selected The Long Way");
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});

it("finds the sample area through the local lookup and clears it back to the catalog", async () => {
  const user = userEvent.setup();
  render(<DemoClimbSearch />);
  await user.click(screen.getByRole("button", { name: "Clear area Pine Canyon" }));
  await waitFor(() => expect(rows()).toHaveLength(7));
  const lookup = screen.getByRole("combobox", { name: "In area" });
  await user.type(lookup, "pine");
  await user.click(await screen.findByRole("option", { name: /Pine Canyon/ }));
  expect(screen.getByRole("button", { name: "Clear area Pine Canyon" })).toBeInTheDocument();
  await waitFor(() => expect(rows()).toHaveLength(7));
});
