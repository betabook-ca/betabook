import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

// The gallery adapter mounts the production SearchController/useSearch. Only
// transport and navigation are local, so the browser and DOM suites share data.
import { IntegratedSearchDemo } from "@/stories/fixtures/app-search-demo";

const local = "Cedar Arete, North Woods / Cedar Grove";
const other = "Cedar Arete, Coast Range / Cedar Grove";
const crack = "Cedar Crack, North Woods / Upper Wall";
const traverse = "Cedar Traverse, North Woods / Lower boulders";
const button = (name: string) => screen.getByRole("button", { name });
const result = (name: string) => screen.findByRole("button", { name: `Open ${name}` });
async function quick() {
  const user = userEvent.setup();
  render(<IntegratedSearchDemo surface="quick" />);
  await user.click(button("Search Betabook"));
  return user;
}

it("offers explicit area context only for climb categories", async () => {
  const user = await quick();
  expect(button("Climbs in Cedar Grove")).toBeInTheDocument();
  await user.click(button("Climbers"));
  expect(screen.queryByRole("button", { name: "Climbs in Cedar Grove" })).not.toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "Cedar Lee, Climbing partner" }),
  ).toBeInTheDocument();
  await user.click(button("Areas"));
  expect(screen.queryByRole("button", { name: "Climbs in Cedar Grove" })).not.toBeInTheDocument();
  await user.click(button("Climbs"));
  expect(button("Climbs in Cedar Grove")).toBeInTheDocument();
});

it("clearing area scope restores global results without changing the query", async () => {
  const user = await quick();
  await user.click(button("Climbs in Cedar Grove"));
  await waitFor(() =>
    expect(screen.getByRole("option", { name: local })).toHaveAttribute("aria-disabled", "false"),
  );
  expect(screen.queryByRole("option", { name: other })).not.toBeInTheDocument();
  await user.click(button("Clear area Cedar Grove"));
  expect(
    screen.queryByRole("button", { name: /Climbs in Cedar Grove|Clear area Cedar Grove/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Search Betabook" })).toHaveValue("cedar");
  await waitFor(() =>
    expect(screen.getByRole("option", { name: other })).toHaveAttribute("aria-disabled", "false"),
  );
});

it("clears quick results and prompts for a name in every category", async () => {
  const user = await quick();
  expect(await screen.findByRole("option", { name: /Cedar Lee/ })).toBeInTheDocument();
  await user.click(button("Clear search betabook"));
  for (const category of ["Climbs", "Areas", "Climbers"]) {
    await user.click(button(category));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(
      screen.getByText(`Search ${category.toLowerCase()} by name.`, { exact: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Search Betabook" })).toHaveAttribute(
      "placeholder",
      `Search ${category.toLowerCase()}…`,
    );
  }
  await user.click(button("Climbs"));
  await user.click(button("Climbs in Cedar Grove"));
  expect(button("Clear area Cedar Grove")).toBeInTheDocument();
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
});

it("full search has a single name field and clearing it removes results until typing resumes", async () => {
  const user = userEvent.setup();
  render(<IntegratedSearchDemo />);
  await user.click(button("Climbs"));
  expect(await result(local)).toBeEnabled();
  expect(screen.getAllByRole("searchbox")).toHaveLength(1);
  expect(screen.queryByRole("combobox", { name: "In area" })).not.toBeInTheDocument();
  await user.click(button("Clear search betabook"));
  expect(screen.queryByRole("region", { name: "Climbs results" })).not.toBeInTheDocument();
  expect(screen.getByText("Search climbs by name.", { exact: true })).toBeInTheDocument();
  await user.type(screen.getByRole("searchbox", { name: "Search Betabook" }), "cedar crack");
  await waitFor(() => expect(screen.getByRole("button", { name: `Open ${crack}` })).toBeEnabled());
  expect(screen.queryByRole("button", { name: `Open ${local}` })).not.toBeInTheDocument();
});

it("expanding quick search preserves query, category and explicit area identity", async () => {
  const user = await quick();
  await user.click(button("Climbs in Cedar Grove"));
  await user.click(button("View all results for “cedar”"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search Betabook" })).toHaveValue("cedar");
  expect(button("Climbs")).toHaveAttribute("aria-pressed", "true");
  expect(button("Clear area Cedar Grove")).toBeInTheDocument();
  expect(screen.getByLabelText("Search URL")).toHaveTextContent("areaId=1");
  expect(await result(local)).toBeEnabled();
  expect(screen.queryByRole("button", { name: `Open ${crack}` })).not.toBeInTheDocument();
});

it("pending quick results cannot select an old record", async () => {
  const user = await quick();
  await waitFor(() =>
    expect(screen.getByRole("option", { name: local })).toHaveAttribute("aria-disabled", "false"),
  );
  const input = screen.getByRole("combobox", { name: "Search Betabook" });
  await user.clear(input);
  await user.type(input, "cedar crack");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(screen.queryByLabelText("Selected record")).not.toBeInTheDocument();
  expect(await result(crack)).toBeEnabled();
});

it("changing query invalidates keyboard selection even when returning to the previous query", async () => {
  const user = await quick();
  const input = screen.getByRole("combobox", { name: "Search Betabook" });
  await user.clear(input);
  await user.type(input, "cedar crack");
  await waitFor(() =>
    expect(screen.getByRole("option", { name: crack })).toHaveAttribute("aria-disabled", "false"),
  );
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("option", { name: crack })).toHaveAttribute("aria-selected", "true");
  await user.clear(input);
  await user.type(input, "north face");
  await waitFor(() =>
    expect(
      screen.getByRole("option", { name: "North Face, North Woods / Upper Wall" }),
    ).toHaveAttribute("aria-disabled", "false"),
  );
  await user.clear(input);
  await user.type(input, "cedar crack");
  await waitFor(() =>
    expect(screen.getByRole("option", { name: crack })).toHaveAttribute("aria-disabled", "false"),
  );
  await user.keyboard("{Enter}");
  expect(screen.queryByLabelText("Selected record")).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search Betabook" })).toHaveValue("cedar crack");
});

it("paginates, filters, resets and changes categories using the actual results", async () => {
  const user = userEvent.setup();
  render(<IntegratedSearchDemo />);
  await waitFor(() => expect(button("Open Cedar Lee, Climbing partner")).toBeEnabled());
  await user.click(button("Climbs"));
  await user.click(await screen.findByRole("button", { name: "Load more" }));
  expect(await result(traverse)).toBeEnabled();
  await user.click(button("Boulder"));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: `Open ${crack}` })).not.toBeInTheDocument(),
  );
  expect(await result(local)).toBeEnabled();
  await user.click(button("Expand filters"));
  await user.click(button("Clear all"));
  expect(screen.getByRole("searchbox", { name: "Search Betabook" })).toHaveValue("");
  await user.type(screen.getByRole("searchbox", { name: "Search Betabook" }), "cedar");
  await user.click(button("Climbers"));
  await waitFor(() => expect(button("Open Cedar Lee, Climbing partner")).toBeEnabled());
  await user.click(button("Clear search betabook"));
  expect(screen.getByRole("searchbox", { name: "Search Betabook" })).toHaveValue("");
});

it("retries a failed category while retaining successful results", async () => {
  const user = userEvent.setup();
  render(<IntegratedSearchDemo failure />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load climbers.");
  expect(await result(local)).toBeEnabled();
  await user.click(button("Retry climbers"));
  expect(screen.getByRole("button", { name: `Open ${local}` })).toBeEnabled();
  await waitFor(() => expect(button("Open Cedar Lee, Climbing partner")).toBeEnabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("retries a failed next page and appends records without replacing or duplicating earlier results", async () => {
  const user = userEvent.setup();
  render(<IntegratedSearchDemo pageFailure />);
  await user.click(button("Climbs"));
  expect(await result(local)).toBeEnabled();
  await user.click(button("Load more"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load more");
  expect(screen.getByRole("button", { name: `Open ${local}` })).toBeEnabled();
  await user.click(button("Load more"));
  expect(await result(traverse)).toBeEnabled();
  expect(screen.getAllByRole("button", { name: `Open ${local}` })).toHaveLength(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("sort and expanded grade/rating controls refine results and reset restores them", async () => {
  const user = userEvent.setup();
  render(<IntegratedSearchDemo />);
  await user.click(button("Climbs"));
  expect(await result(local)).toBeEnabled();
  // Search opens on most ascents first, so reaching Z–A means picking the
  // name field before flipping direction.
  expect(button("Sort descending")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Sort by/ }));
  await user.click(await screen.findByRole("option", { name: "Name" }));
  await user.click(button("Sort ascending"));
  const results = screen.getByRole("region", { name: "Climbs results" });
  await waitFor(() =>
    expect(within(results).getAllByRole("button")[0]).toHaveAccessibleName(`Open ${traverse}`),
  );
  await user.click(button("Boulder"));
  await user.click(button("Expand filters"));
  await user.click(screen.getByRole("button", { name: /Min grade/ }));
  await user.click(await screen.findByRole("option", { name: "V4" }));
  await waitFor(() =>
    expect(within(results).queryByRole("button", { name: /Coast Range/ })).not.toBeInTheDocument(),
  );
  await user.click(
    within(screen.getByRole("radiogroup", { name: "Min rating" })).getByRole("radio", {
      name: "4 stars",
    }),
  );
  await waitFor(() =>
    expect(
      within(results).queryByRole("button", { name: /Cedar Traverse/ }),
    ).not.toBeInTheDocument(),
  );
  expect(await result(local)).toBeEnabled();
  await user.click(button("Clear all"));
  expect(screen.getByRole("searchbox", { name: "Search Betabook" })).toHaveValue("");
  await user.type(screen.getByRole("searchbox", { name: "Search Betabook" }), "cedar");
  expect(await result(other)).toBeEnabled();
});

it("suggests climbers you may know only while the full climber search is empty", async () => {
  const user = userEvent.setup();
  render(<IntegratedSearchDemo initialQuery="" initialCategory="climber" suggestions />);
  const suggestions = screen.getByRole("region", { name: "You may know" });
  expect(within(suggestions).getByRole("heading", { name: "You may know" })).toBeInTheDocument();
  expect(
    within(suggestions).getByRole("button", { name: "Open Sam Rivera, 2 mutual friends" }),
  ).toBeEnabled();
  expect(
    within(suggestions).getByRole("button", { name: "Open Jordan Park, 1 mutual friend" }),
  ).toBeEnabled();
  expect(within(suggestions).getByRole("button", { name: "Add friend: Sam Rivera" })).toBeEnabled();
  expect(screen.queryByText("Search climbers by name.")).not.toBeInTheDocument();

  const field = screen.getByRole("searchbox", { name: "Search Betabook" });
  await user.type(field, "cedar");
  expect(await result("Cedar Lee, Climbing partner")).toBeEnabled();
  expect(screen.queryByRole("region", { name: "You may know" })).not.toBeInTheDocument();
  await user.clear(field);
  await user.click(
    within(await screen.findByRole("region", { name: "You may know" })).getByRole("button", {
      name: "Open Jordan Park, 1 mutual friend",
    }),
  );
  expect(screen.getByRole("status", { name: "Selected record" })).toHaveAttribute(
    "data-selected-id",
    "climber-suggested-2",
  );

  await user.click(button("Climbs"));
  expect(screen.queryByRole("region", { name: "You may know" })).not.toBeInTheDocument();
  expect(screen.getByText("Search climbs by name.", { exact: true })).toBeInTheDocument();
});

it("keeps quick climber search to its name prompt", () => {
  render(
    <IntegratedSearchDemo
      surface="quick"
      initialQuery=""
      initialCategory="climber"
      initialOpen
      suggestions
    />,
  );
  expect(screen.getByText("Search climbers by name.", { exact: true })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "You may know" })).not.toBeInTheDocument();
});
