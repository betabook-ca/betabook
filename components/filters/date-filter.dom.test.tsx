import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { DateFilterValue } from "@/lib/filters/date-filter";

import { DateFilter } from "./date-filter";

const EMPTY_DATES: DateFilterValue = {};
function Dates({
  onChange,
  initial = EMPTY_DATES,
}: {
  onChange: (value: DateFilterValue) => void;
  initial?: DateFilterValue;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DateFilter
      value={value}
      referenceDate="2026-09-06"
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}
async function choose(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(screen.getByRole("button", { name: /Dates$/ }));
  await user.click(await screen.findByRole("option", { name: option }));
}
it("starts at All time and applies each calendar preset before clearing all date bounds", async () => {
  const user = userEvent.setup();
  const change = vi.fn<(value: DateFilterValue) => void>();
  render(<Dates onChange={change} />);
  expect(screen.getByRole("button", { name: "All time Dates" })).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  for (const [label, preset, start, end] of [
    ["This month", "this-month", "2026-09-01", "2026-09-30"],
    ["This year", "this-year", "2026-01-01", "2026-12-31"],
    ["Last year", "last-year", "2025-01-01", "2025-12-31"],
  ]) {
    await choose(user, label);
    expect(change).toHaveBeenLastCalledWith({
      dateFrom: start,
      dateTo: end,
      datePreset: preset,
      date: undefined,
    });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  }
  await choose(user, "All time");
  expect(change).toHaveBeenLastCalledWith({
    date: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    datePreset: undefined,
  });
});
it("clearing an optional end turns a range into a single day", async () => {
  const user = userEvent.setup();
  const change = vi.fn<(value: DateFilterValue) => void>();
  render(<Dates initial={{ dateFrom: "2025-06-01", dateTo: "2025-08-31" }} onChange={change} />);
  expect(screen.getByRole("button", { name: "Custom dates Dates" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear end date" }));
  expect(change).toHaveBeenCalledExactlyOnceWith({
    date: "2025-06-01",
    dateFrom: undefined,
    dateTo: undefined,
    datePreset: undefined,
  });
  expect(screen.queryByRole("button", { name: "Clear end date" })).not.toBeInTheDocument();
});
it("reflects externally restored dates and clears custom fields on an external reset", () => {
  const onChange = vi.fn<(value: DateFilterValue) => void>();
  const { rerender } = render(<DateFilter value={{ date: "2025-07-12" }} onChange={onChange} />);
  expect(screen.getByRole("spinbutton", { name: /day, Start date/ })).toHaveTextContent("12");
  rerender(
    <DateFilter value={{ dateFrom: "2025-08-03", dateTo: "2025-08-05" }} onChange={onChange} />,
  );
  expect(screen.getByRole("spinbutton", { name: /day, Start date/ })).toHaveTextContent("03");
  expect(screen.getByRole("spinbutton", { name: /day, End date/ })).toHaveTextContent("05");
  rerender(<DateFilter value={{}} onChange={onChange} />);
  expect(screen.getByRole("button", { name: "All time Dates" })).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
