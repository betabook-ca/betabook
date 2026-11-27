import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { LoadMoreButton } from "./load-more-button";

it("associates the failure with the retry button and clears it without losing focus", async () => {
  const user = userEvent.setup();
  const onPress = vi.fn<() => void>();
  const { rerender } = render(<LoadMoreButton loading={false} failed onPress={onPress} />);
  const button = screen.getByRole("button", { name: "Load more" });
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load more — try again.");
  expect(button).toHaveAccessibleDescription("Couldn't load more — try again.");
  await user.tab();
  await user.keyboard("{Enter}");
  expect(onPress).toHaveBeenCalledTimes(1);

  rerender(<LoadMoreButton loading={false} onPress={onPress} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(button).not.toHaveAttribute("aria-describedby");
  expect(button).toHaveFocus();
});

it("keeps focus while pending, blocks keyboard and pointer requests, and resumes when ready", async () => {
  const user = userEvent.setup();
  const onPress = vi.fn<() => void>();
  const { rerender } = render(<LoadMoreButton loading={false} onPress={onPress} />);
  const button = screen.getByRole("button", { name: "Load more" });
  await user.tab();
  await user.keyboard("{Enter}");
  expect(onPress).toHaveBeenCalledTimes(1);

  rerender(<LoadMoreButton loading onPress={onPress} />);
  expect(screen.getByRole("button", { name: "Loading…" })).toBe(button);
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).toHaveFocus();
  await user.keyboard("{Enter}");
  await user.click(button);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(button).toHaveFocus();

  rerender(<LoadMoreButton loading={false} onPress={onPress} />);
  await user.keyboard("{Enter}");
  expect(onPress).toHaveBeenCalledTimes(2);
  expect(button).toHaveFocus();
});
