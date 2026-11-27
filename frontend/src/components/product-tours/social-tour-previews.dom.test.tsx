import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { DemoFeed } from "./social-tour-previews";

it("filters the real feed display locally without exposing sample destinations", async () => {
  const user = userEvent.setup();
  render(<DemoFeed />);
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getByText("Send · Flash")).toBeVisible();
  expect(screen.getByText("Session", { exact: true })).toBeVisible();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Sends" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article", { name: "Moss Ladder" })).toBeVisible();
  expect(screen.queryByText("Training", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
