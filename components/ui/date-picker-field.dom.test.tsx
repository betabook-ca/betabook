import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { DatePickerField } from "./date-picker-field";

it.each(["", "not-a-date", "2026-13-45"])(
  "shows empty segments for %j without changing the caller's value",
  (value) => {
    const change = vi.fn<(value: string) => void>();
    render(<DatePickerField label="Date" value={value} onChange={change} />);
    expect(screen.getByRole("spinbutton", { name: /month, Date/ })).toHaveTextContent("mm");
    expect(screen.getByRole("spinbutton", { name: /day, Date/ })).toHaveTextContent("dd");
    expect(screen.getByRole("spinbutton", { name: /year, Date/ })).toHaveTextContent("yyyy");
    expect(change).not.toHaveBeenCalled();
  },
);

it("reflects restored and cleared dates without emitting edits", () => {
  const change = vi.fn<(value: string) => void>();
  const view = render(<DatePickerField label="Date" value="2026-08-12" onChange={change} />);
  expect(screen.getByRole("spinbutton", { name: /day, Date/ })).toHaveTextContent("12");
  view.rerender(<DatePickerField label="Date" value="2025-01-03" onChange={change} />);
  expect(screen.getByRole("spinbutton", { name: /day, Date/ })).toHaveTextContent("03");
  expect(screen.getByRole("spinbutton", { name: /month, Date/ })).toHaveTextContent("01");
  expect(screen.getByRole("spinbutton", { name: /year, Date/ })).toHaveTextContent("2025");
  view.rerender(<DatePickerField label="Date" value="" onChange={change} />);
  expect(screen.getByRole("spinbutton", { name: /day, Date/ })).toHaveTextContent("dd");
  expect(change).not.toHaveBeenCalled();
});

it("enforces the calendar bound, removes it when unset, and emits a padded ISO date", async () => {
  const user = userEvent.setup();
  const change = vi.fn<(value: string) => void>();
  const view = render(
    <DatePickerField label="Date" value="2026-01-02" max="2026-01-03" onChange={change} />,
  );
  await user.click(screen.getByRole("button", { name: "Calendar Date" }));
  const fourth = screen.getByRole("button", { name: /Sunday, January 4, 2026/ });
  expect(fourth).toHaveAttribute("aria-disabled", "true");
  await user.click(fourth);
  expect(change).not.toHaveBeenCalled();
  view.rerender(<DatePickerField label="Date" value="2026-01-02" onChange={change} />);
  await user.click(screen.getByRole("button", { name: /Sunday, January 4, 2026/ }));
  expect(change).toHaveBeenCalledExactlyOnceWith("2026-01-04");
});

it("emits an empty value when the selected date is cleared", async () => {
  const user = userEvent.setup();
  const change = vi.fn<(value: string) => void>();
  render(<DatePickerField label="Date" value="2026-01-02" onChange={change} />);
  await user.tab();
  expect(screen.getByRole("spinbutton", { name: /month, Date/ })).toHaveFocus();
  await user.keyboard("{Backspace}{Tab}{Backspace}{Tab}{Backspace>4}{Tab}");
  expect(change).toHaveBeenCalledExactlyOnceWith("");
});

it("disables both date entry and the unknown-date control while saving", async () => {
  const user = userEvent.setup();
  const change = vi.fn<(value: string) => void>();
  const unknown = vi.fn<(value: boolean) => void>();
  render(
    <DatePickerField
      label="Date"
      value="2026-01-02"
      isDisabled
      onChange={change}
      onUnknownChange={unknown}
    />,
  );
  const day = screen.getByRole("spinbutton", { name: /day, Date/ });
  expect(day).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("button", { name: "Calendar Date" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "I don't know" })).toBeDisabled();
  await user.click(day);
  await user.keyboard("{ArrowUp}");
  await user.click(screen.getByRole("checkbox", { name: "I don't know" }));
  expect(day).toHaveTextContent("02");
  expect(change).not.toHaveBeenCalled();
  expect(unknown).not.toHaveBeenCalled();
});
