import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import { TagInput } from "./tag-input";

const EMPTY_TAGS: string[] = [];
function Tags({ initial = EMPTY_TAGS }: { initial?: string[] }) {
  const [tags, setTags] = useState(initial);
  return <TagInput value={tags} onChange={setTags} />;
}

it("rejects duplicate tags and frees a place after removal at the limit", async () => {
  const user = userEvent.setup();
  render(<Tags initial={Array.from({ length: 8 }, (_, i) => `tag-${i + 1}`)} />);
  const input = screen.getByRole("combobox", { name: "Tags" });
  expect(input).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Remove tag tag-1" }));
  expect(input).toBeEnabled();
  await user.type(input, "tag-2{Enter}");
  expect(screen.getAllByRole("button", { name: /^Remove tag / })).toHaveLength(7);
  expect(screen.getAllByRole("button", { name: "Remove tag tag-2" })).toHaveLength(1);
  await user.type(input, "new-tag{Enter}");
  expect(screen.getAllByRole("button", { name: /^Remove tag / })).toHaveLength(8);
  expect(screen.getByRole("button", { name: "Remove tag new-tag" })).toBeInTheDocument();
  expect(input).toBeDisabled();
});

it("normalizes tags, commits on comma and blur, and removes a tag through its remove button", async () => {
  const user = userEvent.setup();
  render(<Tags />);
  const input = screen.getByRole("combobox", { name: "Tags" });
  await user.type(input, "TECHNIQUE,power");
  await user.tab();
  expect(
    screen.getAllByRole("button", { name: /^Remove tag / }).map((el) => el.textContent),
  ).toEqual(["#technique", "#power"]);
  await user.click(input);
  await user.click(screen.getByRole("button", { name: "Remove tag power" }));
  expect(screen.queryByRole("button", { name: "Remove tag power" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove tag technique" })).toBeInTheDocument();
});

it("announces invalid input without changing tags or submitting the surrounding form", async () => {
  const user = userEvent.setup();
  const submit = vi.fn<(event: React.FormEvent) => void>((event) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <Tags />
    </form>,
  );
  const input = screen.getByRole("combobox", { name: "Tags" });
  await user.type(input, "bad!{Enter}");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Tags can only contain letters, numbers and hyphens.",
  );
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByRole("button", { name: /^Remove tag / })).not.toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
  await user.clear(input);
  await user.type(input, "good{Enter}");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove tag good" })).toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});

it("shows a live tag count with concise help and restrictions only after invalid input", async () => {
  const user = userEvent.setup();
  render(<Tags />);
  const input = screen.getByRole("combobox", { name: "Tags" });
  expect(screen.getByText("0/8 tags")).toBeInTheDocument();
  expect(screen.getByText("Enter, Space, or comma to add.")).toBeInTheDocument();
  expect(screen.queryByText(/Letters, numbers and hyphens only/)).not.toBeInTheDocument();
  await user.type(input, "trip{Enter}");
  expect(screen.getByText("1/8 tags")).toBeInTheDocument();
  await user.type(input, "a".repeat(25) + "{Enter}");
  expect(screen.getByRole("alert")).toHaveTextContent("Tags can contain up to 24 characters.");
  expect(screen.getByText("1/8 tags")).toBeInTheDocument();
  await user.clear(input);
  await user.type(input, "power ");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("2/8 tags")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove tag trip" }));
  expect(screen.getByText("1/8 tags")).toBeInTheDocument();
});
