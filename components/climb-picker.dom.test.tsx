import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { IntegratedClimbPickerDemo } from "@/stories/fixtures/app-search-demo";

it("logging omits area lookup, appends the next page and selects its record by identity", async () => {
  const user = userEvent.setup();
  render(<IntegratedClimbPickerDemo />);
  expect(screen.getByRole("searchbox", { name: "Choose a climb" })).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "In area" })).not.toBeInTheDocument();
  const results = await screen.findByRole("region", { name: "Climbs results" });
  await waitFor(() => expect(within(results).getAllByRole("button")).toHaveLength(5));
  expect(
    within(results).getByRole("button", {
      name: "Choose Cedar Arete, North Woods / Cedar Grove",
    }),
  ).toBeEnabled();
  expect(screen.queryByRole("button", { name: /Choose Cedar Traverse/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Load more" }));
  const next = await screen.findByRole("button", {
    name: "Choose Cedar Traverse, North Woods / Lower boulders",
  });
  expect(within(results).getAllByRole("button")).toHaveLength(7);
  expect(
    screen.getAllByRole("button", {
      name: "Choose Cedar Arete, North Woods / Cedar Grove",
    }),
  ).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  await user.click(next);
  expect(screen.getByLabelText("Selected record")).toHaveAttribute("data-selected-id", "climb-105");
});

it("clearing the logging picker leaves no redundant prompt or result headings", async () => {
  const user = userEvent.setup();
  render(<IntegratedClimbPickerDemo />);
  expect(
    await screen.findByRole("button", {
      name: "Choose Cedar Arete, North Woods / Cedar Grove",
    }),
  ).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Clear choose a climb" }));
  expect(screen.queryByRole("heading", { name: "Climbs" })).not.toBeInTheDocument();
  expect(
    screen.queryByText("Choose a climb to continue.", { exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Search for a climb by name.", { exact: true }),
  ).not.toBeInTheDocument();
});

it("merge selection disables the source and reports a distinct destination identity", async () => {
  const user = userEvent.setup();
  render(<IntegratedClimbPickerDemo mode="merge" />);
  const source = await screen.findByRole("button", {
    name: "Choose Cedar Arete, North Woods / Cedar Grove",
  });
  expect(source).toBeDisabled();
  await user.click(source);
  expect(screen.queryByLabelText("Selected record")).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", {
      name: "Choose Cedar Arete, Coast Range / Cedar Grove",
    }),
  );
  expect(screen.getByLabelText("Selected record")).toHaveAttribute("data-selected-id", "climb-106");
});

it("import seeds text but only constrains the area after selecting an identity", async () => {
  const user = userEvent.setup();
  render(<IntegratedClimbPickerDemo mode="import" />);
  expect(screen.getByRole("searchbox", { name: "Choose a climb" })).toHaveValue("Cedar Arete");
  const area = screen.getByRole("combobox", { name: "In area" });
  expect(area).toHaveValue("Cedar Grove");
  expect(screen.queryByRole("button", { name: "Clear area Cedar Grove" })).not.toBeInTheDocument();
  expect(
    await screen.findByRole("button", { name: /Choose Cedar Arete, Coast Range/ }),
  ).toBeEnabled();
  await user.clear(area);
  await user.type(area, "cedar");
  await user.click(await screen.findByRole("option", { name: /California \/ North Woods/ }));
  expect(screen.getByRole("button", { name: "Clear area Cedar Grove" })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /Choose.*Coast Range/ })).not.toBeInTheDocument(),
  );
  expect(
    await screen.findByRole("button", {
      name: "Choose Cedar Arete, North Woods / Cedar Grove",
    }),
  ).toBeEnabled();
});

it("logging narrows to one discipline at a time without an expanded filter panel", async () => {
  const user = userEvent.setup();
  render(<IntegratedClimbPickerDemo />);
  expect(screen.queryByRole("button", { name: /Expand filters/ })).not.toBeInTheDocument();
  const boulder = screen.getByRole("button", { name: "Boulder" });
  const sport = screen.getByRole("button", { name: "Sport" });
  await user.click(boulder);
  expect(boulder).toHaveAttribute("aria-pressed", "true");
  await user.click(sport);
  expect(sport).toHaveAttribute("aria-pressed", "true");
  expect(boulder).toHaveAttribute("aria-pressed", "false");
  await user.click(sport);
  expect(sport).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Trad" })).toHaveAttribute("aria-pressed", "false");
});
