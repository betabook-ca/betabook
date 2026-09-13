import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import { HashtagFilter } from "./hashtag-filter";

const tags = ["outdoors", "power", "project", "strength", "technique", "trip", "trip-2026"];
function Hashtags() {
  const [value, setValue] = useState<string[]>([]);
  return <HashtagFilter value={value} onChange={setValue} tags={tags} />;
}

it.each(["{Enter}", " ", ","])(
  "only commits existing tags with %s and permits removal",
  async (key) => {
    const user = userEvent.setup();
    render(<Hashtags />);
    const input = screen.getByRole("combobox", { name: "Tags" });
    expect(input).toHaveValue("#");
    await user.type(input, key);
    expect(screen.queryByRole("button", { name: /^Remove tag/ })).not.toBeInTheDocument();
    await user.type(input, `UNLISTED${key}`);
    expect(input).toHaveValue("#UNLISTED");
    expect(screen.queryByRole("button", { name: /^Remove tag/ })).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, `TRIP${key}`);
    expect(input).toHaveValue("#");
    expect(screen.getByRole("button", { name: "Remove tag trip" })).toHaveTextContent("#trip");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.type(input, `missing${key}`);
    await user.keyboard("{Escape}");
    expect(screen.getAllByRole("button", { name: /^Remove tag/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Remove tag trip" }));
    expect(screen.queryByRole("button", { name: /^Remove tag/ })).not.toBeInTheDocument();
  },
);

it("selects suggestions, preserves the prefix, and excludes selected tags when reopened", async () => {
  const user = userEvent.setup();
  render(<Hashtags />);
  const input = screen.getByRole("combobox", { name: "Tags" });
  await user.clear(input);
  expect(input).toHaveValue("#");
  await user.click(input);
  expect(await screen.findAllByRole("option")).toHaveLength(7);
  await user.click(screen.getByRole("option", { name: "#outdoors" }));
  expect(screen.getByRole("button", { name: "Remove tag outdoors" })).toBeInTheDocument();
  await user.click(input);
  expect(await screen.findAllByRole("option")).toHaveLength(6);
  expect(screen.queryByRole("option", { name: "#outdoors" })).not.toBeInTheDocument();
  await user.type(input, "TRI");
  expect(await screen.findAllByRole("option")).toHaveLength(2);
  await user.click(screen.getByRole("option", { name: "#trip" }));
  expect(input).toHaveValue("#");
  await user.type(input, "trip ");
  expect(screen.getAllByRole("button", { name: /^Remove tag/ })).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Remove tag outdoors" }));
  expect(screen.getByRole("button", { name: "Remove tag trip" })).toBeInTheDocument();
});

it("closes suggestions and resets the draft when the parent resets its selection", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <HashtagFilter value={["trip"]} onChange={vi.fn<(value: string[]) => void>()} tags={tags} />,
  );
  const input = screen.getByRole("combobox", { name: "Tags" });
  await user.type(input, "proj");
  expect(await screen.findByRole("option", { name: "#project" })).toBeInTheDocument();
  rerender(<HashtagFilter value={[]} onChange={vi.fn<(value: string[]) => void>()} tags={tags} />);
  expect(input).toHaveValue("#");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Remove tag trip" })).not.toBeInTheDocument();
});
