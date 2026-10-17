import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { SendCommentAudience, SharingAudience } from "@/lib/privacy";

import { PrivacyDetails, PrivacyFields } from "./privacy-fields";

function Privacy({ pending = false }: { pending?: boolean }) {
  const [isPrivate, setPrivate] = useState(false);
  const [journal, setJournal] = useState<SharingAudience>("friends");
  const [comment, setComment] = useState<SendCommentAudience>("public");
  const [trips, setTrips] = useState<SharingAudience>("public");
  return (
    <PrivacyFields
      isPrivate={isPrivate}
      isPending={pending}
      journalVisibility={journal}
      sendCommentVisibility={comment}
      tripVisibility={trips}
      onProfileChange={setPrivate}
      onJournalChange={setJournal}
      onSendCommentChange={setComment}
      onTripsChange={setTrips}
    />
  );
}

it("masks audiences on private profiles and restores each independent choice", async () => {
  const user = userEvent.setup();
  render(<Privacy />);
  const commentary = screen.getByRole("button", { name: /Send commentary audience/ });
  const journal = screen.getByRole("button", { name: /Journal and goals audience/ });
  const trips = screen.getByRole("button", { name: /Trips audience/ });
  const profile = screen.getByRole("switch", { name: "Private profile" });
  expect(profile).toHaveAccessibleDescription("Signed-in members can see your profile and sends.");
  expect(commentary).toHaveTextContent("Members");
  expect(journal).toHaveTextContent("Friends");
  expect(trips).toHaveTextContent("Members");
  await user.click(commentary);
  await user.click(await screen.findByRole("option", { name: "Friends" }));
  await user.click(journal);
  await user.click(await screen.findByRole("option", { name: "Members" }));
  await user.click(trips);
  await user.click(await screen.findByRole("option", { name: "Friends" }));
  await user.click(profile);
  expect(profile).toBeChecked();
  expect(commentary).toBeDisabled();
  expect(journal).toBeDisabled();
  expect(commentary).toHaveTextContent("Only me");
  expect(journal).toHaveTextContent("Only me");
  expect(trips).toBeDisabled();
  expect(trips).toHaveTextContent("Only me");
  expect(profile).toHaveAccessibleDescription(
    /Your audience choices are kept for when you turn this off/,
  );
  await user.click(profile);
  expect(profile).not.toBeChecked();
  expect(commentary).toBeEnabled();
  expect(journal).toBeEnabled();
  expect(commentary).toHaveTextContent("Friends");
  expect(journal).toHaveTextContent("Members");
  expect(trips).toHaveTextContent("Friends");
});

it("offers Everyone for send commentary but not for the journal", async () => {
  const user = userEvent.setup();
  render(<Privacy />);
  const optionNames = () => screen.getAllByRole("option").map((option) => option.textContent);
  const commentary = screen.getByRole("button", { name: /Send commentary audience/ });
  await user.click(commentary);
  await waitFor(() => expect(optionNames()).toEqual(["Only me", "Friends", "Members", "Everyone"]));
  await user.click(screen.getByRole("option", { name: "Everyone" }));
  expect(commentary).toHaveTextContent("Everyone");
  await user.click(screen.getByRole("button", { name: /Journal and goals audience/ }));
  await waitFor(() => expect(optionNames()).toEqual(["Only me", "Friends", "Members"]));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: /Trips audience/ }));
  await waitFor(() => expect(optionNames()).toEqual(["Only me", "Friends", "Members"]));
});

it("prevents changes to every privacy control during a save", async () => {
  const user = userEvent.setup();
  const change = vi.fn<(value: boolean | SendCommentAudience) => void>();
  render(
    <PrivacyFields
      isPrivate={false}
      isPending
      journalVisibility="friends"
      sendCommentVisibility="public"
      tripVisibility="public"
      onProfileChange={change}
      onJournalChange={change}
      onSendCommentChange={change}
      onTripsChange={change}
    />,
  );
  const controls = [
    screen.getByRole("switch"),
    screen.getByRole("button", { name: /Send commentary audience/ }),
    screen.getByRole("button", { name: /Journal and goals audience/ }),
    screen.getByRole("button", { name: /Trips audience/ }),
  ];
  for (const control of controls) {
    expect(control).toBeDisabled();
    await user.click(control);
  }
  expect(change).not.toHaveBeenCalled();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

it("explains who can read trip notes", () => {
  render(<PrivacyDetails defaultExpanded />);

  const trips = screen
    .getAllByRole("listitem")
    .find((item) => /who else can open your trips/.test(item.textContent ?? ""));
  expect(trips).toHaveTextContent(
    "Your friends and anyone with your profile link can read trip notes, regardless of your Journal and goals setting.",
  );
  expect(trips).toHaveTextContent(
    "People who can read your journal can also see a trip's journal entries and tagged friends.",
  );
  expect(trips).not.toHaveTextContent("Trips follow the audiences above");
});

it("explains who can see trip photos and where they load from", () => {
  render(<PrivacyDetails defaultExpanded />);

  const items = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
  expect(items.find((item) => item.startsWith("Anyone with your profile link"))).toContain(
    "your trips with their notes, photos and sends, whatever your Trips setting",
  );
  const trips = items.find((item) => /who else can open your trips/.test(item));
  expect(trips).toContain("who else can open your trips, with their photos and sends");
  expect(trips).toContain("Photos load from Google Photos.");
});
