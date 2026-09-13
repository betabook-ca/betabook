import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { CompanionList } from "./companion-list";

const companions = [
  { id: "alex", name: "Alex Rivera", isSelf: false },
  { id: "sam", name: "Sam Rivera", isSelf: true },
];
it("requests self-removal and keeps the other companion when the parent applies it", async () => {
  const user = userEvent.setup();
  const remove = vi.fn<() => void>();
  const { rerender } = render(<CompanionList companions={companions} onRemoveSelf={remove} />);
  expect(screen.getByRole("link", { name: "Sam Rivera" })).toHaveAttribute("href", "/users/sam");
  await user.click(screen.getByRole("button", { name: "Remove my tag" }));
  expect(remove).toHaveBeenCalledOnce();
  rerender(<CompanionList companions={[companions[0]]} onRemoveSelf={remove} />);
  expect(screen.getByText(/With/)).toHaveTextContent("With Alex Rivera");
  expect(screen.queryByText("Sam Rivera")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Alex Rivera" })).toHaveAttribute("href", "/users/alex");
  expect(screen.queryByRole("button", { name: "Remove my tag" })).not.toBeInTheDocument();
});
it("prevents repeated removal while pending", async () => {
  const user = userEvent.setup();
  const remove = vi.fn<() => void>();
  render(<CompanionList companions={companions} onRemoveSelf={remove} pending />);
  const button = screen.getByRole("button", { name: "Removing…" });
  expect(button).toBeDisabled();
  await user.click(button);
  expect(remove).not.toHaveBeenCalled();
});
it("preserves names on failure and exposes a working retry", async () => {
  const user = userEvent.setup();
  const remove = vi.fn<() => void>();
  render(
    <CompanionList
      companions={companions}
      onRemoveSelf={remove}
      error="Couldn't remove your tag. Try again."
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't remove your tag. Try again.");
  expect(screen.getByRole("link", { name: "Sam Rivera" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove my tag" }));
  expect(remove).toHaveBeenCalledOnce();
});
