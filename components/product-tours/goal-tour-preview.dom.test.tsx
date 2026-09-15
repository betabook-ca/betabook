import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { DemoGoals } from "./goal-tour-preview";

const href = (id: string) => `/tutorial/journal/${id}`;

it("saves an example goal with the real hashtag editor", async () => {
  const user = userEvent.setup();
  render(<DemoGoals stepId="goal-tags" href={href} />);
  expect(screen.getByRole("heading", { name: "Training", level: 2 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Remove tag hangboard" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Remove tag strength" })).toBeVisible();
  await user.clear(screen.getByRole("spinbutton"));
  await user.type(screen.getByRole("spinbutton"), "4");
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  expect(
    await screen.findByText("Example saved: Train 4 times · #hangboard #strength"),
  ).toHaveAttribute("role", "status");
});

it("counts only matching sample entries and keeps the feed achievement after archiving", async () => {
  const user = userEvent.setup();
  render(<DemoGoals stepId="goal-progress" href={href} />);
  await user.click(screen.getByRole("button", { name: "Log strength only" }));
  expect(screen.getByText("0/2")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Log both tags" }));
  expect(screen.getByText("1/2")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Log both tags" }));
  expect(screen.getByRole("heading", { name: "You did it!" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Active (0/5)" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Archive goal" }));
  expect(screen.getByText("No active goals.")).toBeVisible();
  expect(screen.getByText("Goal accomplished")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "History (1)" }));
  expect(
    within(screen.getByRole("region", { name: "My goals" })).getByText(
      "Train 2 times · #hangboard #strength",
    ),
  ).toBeVisible();
  for (const link of screen.getAllByRole("link"))
    expect(link.getAttribute("href")).toMatch(/^\/tutorial\//);
  await user.click(screen.getByRole("button", { name: "Reset example" }));
  expect(screen.getByText("0/2")).toBeVisible();
  expect(screen.queryByText("Goal accomplished")).not.toBeInTheDocument();
});
