import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { expect, it, vi } from "vitest";

import { JournalEntryDateFields } from "./journal-entry-date-fields";

function Dates(props: Partial<ComponentProps<typeof JournalEntryDateFields>> = {}) {
  const [entryDate, setEntryDate] = useState("2026-09-01");
  return (
    <JournalEntryDateFields
      hasClimb
      hasPriorSend={false}
      today="2026-09-06"
      entryDate={entryDate}
      sent={false}
      onDateChange={setEntryDate}
      {...props}
    />
  );
}
it("offers I don't know only for a send, emptying and restoring the date", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Dates />);
  expect(screen.queryByRole("checkbox", { name: "I don't know" })).not.toBeInTheDocument();
  rerender(<Dates sent />);
  const unknown = screen.getByRole("checkbox", { name: "I don't know" });
  expect(unknown).not.toBeChecked();
  expect(screen.getByRole("spinbutton", { name: /day, Date/ })).toHaveTextContent("01");
  await user.click(unknown);
  expect(unknown).toBeChecked();
  expect(screen.getByRole("spinbutton", { name: /day, Date/ })).not.toHaveTextContent("01");
  await user.click(unknown);
  expect(unknown).not.toBeChecked();
  expect(screen.getByRole("spinbutton", { name: /day, Date/ })).toHaveTextContent("06");
});
it("hides I don't know for a repeat, which always needs a date", () => {
  render(<Dates hasPriorSend sent />);
  expect(screen.queryByRole("checkbox", { name: "I don't know" })).not.toBeInTheDocument();
  expect(screen.queryByText(/need a date/)).not.toBeInTheDocument();
});
it("offers no I don't know control when editing an entry, which always needs its date", () => {
  render(<Dates existingEntry={{ sent: false }} sent />);
  expect(screen.getByRole("spinbutton", { name: /day, Date/ })).toHaveTextContent("01");
  expect(screen.queryByRole("checkbox", { name: "I don't know" })).not.toBeInTheDocument();
});
it("withholds I don't know on a broken climb and explains the cap", () => {
  render(<Dates sent brokenOn="2026-03-05" />);
  expect(screen.queryByRole("checkbox", { name: "I don't know" })).not.toBeInTheDocument();
  expect(
    screen.getByText("This climb broke on 2026-03-05; only earlier dates can be logged."),
  ).toBeVisible();
});
it("offers training only its date, since it can never be saved without one", () => {
  render(<Dates hasClimb={false} />);
  expect(screen.getByRole("spinbutton", { name: /day, Date/ })).toHaveTextContent("01");
  expect(screen.queryByText(/need a date/)).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("shows no date hint on a sent climb before a pill is chosen", () => {
  render(<Dates hasPriorSend />);
  expect(screen.queryByText(/need a date/)).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("prevents editing a recorded repeat date and explains how to change it", async () => {
  const user = userEvent.setup();
  const change = vi.fn<(date: string) => void>();
  render(<Dates existingEntry={{ sent: true }} sent onDateChange={change} />);
  expect(
    screen.getByText("To change this repeat’s date, delete the entry and log it again."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Calendar Date" })).toBeDisabled();
  const day = screen.getByRole("spinbutton", { name: /day, Date/ });
  await user.click(day);
  await user.keyboard("{ArrowUp}");
  expect(day).toHaveTextContent("01");
  expect(change).not.toHaveBeenCalled();
});
