import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { DemoProjects, DemoSends } from "./profile-tour-previews";

it("sorts the sample sends with the app's sort dropdown and direction control", async () => {
  const user = userEvent.setup();
  render(<DemoSends />);
  await user.click(screen.getByRole("button", { name: /Sort by/ }));
  await user.click(screen.getByRole("option", { name: "Grade" }));
  const order = () =>
    screen.getAllByText(/^(Quiet Arete|Moss Ladder|First Light)$/).map((name) => name.textContent);
  expect(order()).toEqual(["Quiet Arete", "Moss Ladder", "First Light"]);
  expect(screen.getByRole("button", { name: "Sort descending" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Sort descending" }));
  expect(screen.getByRole("button", { name: "Sort ascending" })).toBeVisible();
  expect(order()).toEqual(["First Light", "Moss Ladder", "Quiet Arete"]);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("loads sample project notes locally with the app's timeline and load-more control", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const user = userEvent.setup();
  render(<DemoProjects />);
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.queryByText("Found the holds but couldn't link the crux.")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText("Found the holds but couldn't link the crux.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
