import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { SendCommentAudience, SharingAudience } from "@/lib/privacy";

import { PrivacyFields } from "./privacy-fields";

function Privacy({ pending = false }: { pending?: boolean }) {
  const [isPrivate, setPrivate] = useState(false);
  const [journal, setJournal] = useState<SharingAudience>("friends");
  const [comment, setComment] = useState<SendCommentAudience>("public");
  return (
    <PrivacyFields
      isPrivate={isPrivate}
      isPending={pending}
      journalVisibility={journal}
      sendCommentVisibility={comment}
      onProfileChange={setPrivate}
      onJournalChange={setJournal}
      onSendCommentChange={setComment}
    />
  );
}

it("masks audiences on private profiles and restores each independent choice", async () => {
  const user = userEvent.setup();
  render(<Privacy />);
  const commentary = screen.getByRole("button", { name: /Send commentary audience/ });
  const journal = screen.getByRole("button", { name: /Journal entries audience/ });
  const profile = screen.getByRole("switch", { name: "Private profile" });
  expect(commentary).toHaveTextContent("Members");
  expect(journal).toHaveTextContent("Friends");
  await user.click(commentary);
  await user.click(await screen.findByRole("option", { name: "Friends" }));
  await user.click(journal);
  await user.click(await screen.findByRole("option", { name: "Members" }));
  await user.click(profile);
  expect(profile).toBeChecked();
  expect(commentary).toBeDisabled();
  expect(journal).toBeDisabled();
  expect(commentary).toHaveTextContent("Only me");
  expect(journal).toHaveTextContent("Only me");
  expect(
    screen.getByText(/Your saved audiences will apply when your profile is visible to members/),
  ).toBeInTheDocument();
  await user.click(profile);
  expect(profile).not.toBeChecked();
  expect(commentary).toBeEnabled();
  expect(journal).toBeEnabled();
  expect(commentary).toHaveTextContent("Friends");
  expect(journal).toHaveTextContent("Members");
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
  await user.click(screen.getByRole("button", { name: /Journal entries audience/ }));
  await waitFor(() => expect(optionNames()).toEqual(["Only me", "Friends", "Members"]));
});

it("prevents changes to all three privacy controls during a save", async () => {
  const user = userEvent.setup();
  const change = vi.fn<(value: boolean | SendCommentAudience) => void>();
  render(
    <PrivacyFields
      isPrivate={false}
      isPending
      journalVisibility="friends"
      sendCommentVisibility="public"
      onProfileChange={change}
      onJournalChange={change}
      onSendCommentChange={change}
    />,
  );
  const controls = [
    screen.getByRole("switch"),
    screen.getByRole("button", { name: /Send commentary audience/ }),
    screen.getByRole("button", { name: /Journal entries audience/ }),
  ];
  for (const control of controls) {
    expect(control).toBeDisabled();
    await user.click(control);
  }
  expect(change).not.toHaveBeenCalled();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
