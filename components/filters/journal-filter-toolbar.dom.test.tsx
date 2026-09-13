import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";

import { JournalFilterToolbar } from "./journal-filter-toolbar";

const router = vi.hoisted(() => ({
  replace: vi.fn<(href: string, options: { scroll: boolean }) => void>(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

it("preserves hashtags across disclosure changes and clears them on reset", async () => {
  const user = userEvent.setup();
  render(
    <JournalFilterToolbar
      userId="alex"
      filter={DEFAULT_JOURNAL_FILTER}
      climbName={null}
      tags={["power", "trip"]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  const input = screen.getByRole("combobox", { name: "Tags" });
  await user.type(input, "power ");
  await user.click(screen.getByRole("button", { name: "Hide filters" }));
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(screen.getByRole("button", { name: "Remove tag power" })).toBeInTheDocument();
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/users/alex/journal?tag=power", { scroll: false }),
  );
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.queryByRole("button", { name: "Remove tag power" })).not.toBeInTheDocument();
});
it("keeps text filtering local and builds view links from the entered filter", async () => {
  const user = userEvent.setup();
  render(
    <JournalFilterToolbar
      userId="alex"
      filter={DEFAULT_JOURNAL_FILTER}
      climbName={null}
      tags={[]}
    />,
  );
  await user.type(screen.getByRole("searchbox", { name: "Filter journal" }), "repeaters");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute(
    "href",
    "/users/alex/journal?view=sessions&q=repeaters",
  );
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/users/alex/journal?q=repeaters", {
      scroll: false,
    }),
  );
});

it("filters the owner's journal by friend and resets the selection", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <JournalFilterToolbar
      userId="alex"
      isOwner
      friends={[
        { id: "sam", name: "Sam Rivera" },
        { id: "lee", name: "Lee Park" },
      ]}
      filter={DEFAULT_JOURNAL_FILTER}
      climbName={null}
      tags={[]}
    />,
  );
  expect(screen.queryByRole("combobox", { name: "With friend" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  await user.click(screen.getByRole("combobox", { name: "With friend" }));
  await user.click(screen.getByRole("option", { name: "Sam Rivera" }));
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/users/alex/journal?friendId=sam", {
      scroll: false,
    }),
  );
  expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute(
    "href",
    "/users/alex/journal?view=sessions&friendId=sam",
  );
  await user.click(screen.getByRole("combobox", { name: "With friend" }));
  await user.click(screen.getByRole("option", { name: "Lee Park" }));
  await waitFor(() =>
    expect(router.replace).toHaveBeenLastCalledWith(
      "/users/alex/journal?friendId=sam&friendId=lee",
      { scroll: false },
    ),
  );
  await user.click(screen.getByRole("button", { name: "Remove friend Sam Rivera" }));
  await waitFor(() =>
    expect(router.replace).toHaveBeenLastCalledWith("/users/alex/journal?friendId=lee", {
      scroll: false,
    }),
  );
  rerender(
    <JournalFilterToolbar
      userId="alex"
      isOwner
      friends={[
        { id: "sam", name: "Sam Rivera" },
        { id: "lee", name: "Lee Park" },
      ]}
      filter={{ ...DEFAULT_JOURNAL_FILTER, friendIds: ["lee"] }}
      climbName={null}
      tags={[]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  await waitFor(() =>
    expect(router.replace).toHaveBeenLastCalledWith("/users/alex/journal", { scroll: false }),
  );
});

it("omits friend filtering on another user's journal", async () => {
  const user = userEvent.setup();
  render(
    <JournalFilterToolbar
      userId="alex"
      filter={DEFAULT_JOURNAL_FILTER}
      climbName={null}
      tags={[]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(screen.queryByText("With friend")).not.toBeInTheDocument();
});
