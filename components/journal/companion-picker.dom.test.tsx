import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { LookupFetcher } from "@/hooks/use-search-lookup";
import type { CompanionOption } from "@/lib/journal-companions";

import { CompanionPicker } from "./companion-picker";

const alex = { id: "alex", name: "Alex Rivera" };
const sam = { id: "sam", name: "Sam Rivera" };
const NO_FRIENDS: CompanionOption[] = [];
function Picker({
  initial = NO_FRIENDS,
  fetcher,
  disabled = false,
}: {
  initial?: CompanionOption[];
  fetcher: LookupFetcher<CompanionOption>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CompanionPicker
      value={value}
      onChange={setValue}
      fetcher={fetcher}
      editing
      disabled={disabled}
    />
  );
}
it("restores a place at the limit, adds a friend by identity, removes them and clears all tags", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn<LookupFetcher<CompanionOption>>().mockResolvedValue([alex]);
  render(
    <Picker
      initial={Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Friend ${i + 1}` }))}
      fetcher={fetcher}
    />,
  );
  expect(screen.getByText("10/10 friends")).toBeInTheDocument();
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Remove friend Friend 1" }));
  expect(screen.getByText("9/10 friends")).toBeInTheDocument();
  await user.type(screen.getByRole("combobox"), "Alex");
  await user.click(await screen.findByRole("option", { name: "Alex Rivera" }));
  expect(screen.getByRole("button", { name: "Remove friend Alex Rivera" })).toBeInTheDocument();
  expect(screen.getByRole("combobox")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Remove friend Alex Rivera" }));
  await user.click(screen.getByRole("button", { name: "Clear tagged friends" }));
  expect(screen.queryByRole("button", { name: /^Remove friend/ })).not.toBeInTheDocument();
  expect(screen.getByText("0/10 friends")).toBeInTheDocument();
  expect(screen.getByText("Tagged friends will be cleared when you save.")).toBeInTheDocument();
});
it("filters selected identities out of suggestions and rejects interaction during a save", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn<LookupFetcher<CompanionOption>>().mockResolvedValue([alex, sam]);
  const { rerender } = render(<Picker initial={[sam]} fetcher={fetcher} />);
  await user.type(screen.getByRole("combobox"), "a");
  expect(await screen.findByRole("option", { name: "Alex Rivera" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Sam Rivera" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: "Alex Rivera" }));
  expect(screen.getByRole("combobox")).toHaveValue("");
  rerender(<Picker fetcher={fetcher} disabled />);
  const remove = screen.getByRole("button", { name: "Remove friend Sam Rivera" });
  expect(remove).toBeDisabled();
  await user.click(remove);
  expect(screen.getByText("2/10 friends")).toBeInTheDocument();
});
it.each(["Retry", "new query"])(
  "retains selected friends after lookup failure and recovers through %s",
  async (recovery) => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn<LookupFetcher<CompanionOption>>()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue([alex]);
    render(<Picker initial={[sam]} fetcher={fetcher} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Alex");
    await user.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t load friends. Your selections are kept.",
    );
    expect(screen.getByRole("button", { name: "Remove friend Sam Rivera" })).toBeInTheDocument();
    if (recovery === "Retry") {
      await user.click(screen.getByRole("button", { name: "Retry" }));
      await user.click(input);
      await user.keyboard("{ArrowDown}");
    } else {
      await user.clear(input);
      await user.type(input, "Alex R");
    }
    await user.click(await screen.findByRole("option", { name: "Alex Rivera" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Remove friend Alex Rivera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove friend Sam Rivera" })).toBeInTheDocument();
    expect(screen.getByText("2/10 friends")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
