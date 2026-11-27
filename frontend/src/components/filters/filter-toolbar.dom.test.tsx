import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import { GradePreferencesProvider } from "@/components/ui/grade-preferences";
import { DEFAULT_DISCIPLINE_FILTER } from "@/lib/filters/discipline-filter";

import { FilterToolbar } from "./filter-toolbar";

function Toolbar() {
  const [value, setValue] = useState(DEFAULT_DISCIPLINE_FILTER);
  return (
    <FilterToolbar
      value={value}
      onChange={setValue}
      onReset={() => setValue(DEFAULT_DISCIPLINE_FILTER)}
    />
  );
}
it("retains grade choices across disclosure changes and reset clears disciplines and bounds", async () => {
  const user = userEvent.setup();
  render(<Toolbar />);
  const boulder = screen.getByRole("button", { name: "Boulder" });
  await user.click(boulder);
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  await user.click(screen.getByRole("button", { name: /Min grade/ }));
  await user.click(await screen.findByRole("option", { name: "V4" }));
  expect(screen.getByRole("button", { name: /Min grade/ })).toHaveTextContent("V4");
  await user.click(screen.getByRole("button", { name: "Hide filters" }));
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(screen.getByRole("button", { name: /Min grade/ })).toHaveTextContent("V4");
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(boulder).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("button", { name: /Min grade/ })).not.toBeInTheDocument();
  await user.click(boulder);
  expect(screen.getByRole("button", { name: /Min grade/ })).toHaveTextContent("VB");
});

it("lists French route grades once each and bounds the range by the whole label", async () => {
  const user = userEvent.setup();
  const changes = vi.fn<(value: typeof DEFAULT_DISCIPLINE_FILTER) => void>();
  const latest = () => changes.mock.lastCall?.[0];
  function Observed() {
    const [value, setValue] = useState(DEFAULT_DISCIPLINE_FILTER);
    return (
      <FilterToolbar
        value={value}
        onChange={(next) => {
          changes(next);
          setValue(next);
        }}
        onReset={() => setValue(DEFAULT_DISCIPLINE_FILTER)}
      />
    );
  }
  render(
    <GradePreferencesProvider value={{ boulder: "hueco", rope: "french" }}>
      <Observed />
    </GradePreferencesProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Sport" }));
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  await user.click(screen.getByRole("button", { name: /Min grade/ }));
  const labels = (await screen.findAllByRole("option")).map((option) => option.textContent);
  expect(labels.slice(0, 4)).toEqual(["1", "2", "3", "4a"]);
  expect(labels.filter((label) => label === "2")).toHaveLength(1);
  // The lower bound takes the label's first ordinal: "2 and up" includes 5.1.
  await user.click(screen.getByRole("option", { name: "2" }));
  expect(latest()?.sportRange).toEqual([1, 33]);
  expect(screen.getByRole("button", { name: /Min grade/ })).toHaveTextContent("2");
  expect(screen.getByText("Sport grades: 2–9c")).toBeInTheDocument();
  // The upper bound takes the label's last ordinal.
  await user.click(screen.getByRole("button", { name: /Max grade/ }));
  await user.click(await screen.findByRole("option", { name: "3" }));
  expect(latest()?.sportRange).toEqual([1, 4]);
  expect(screen.getByText("Sport grades: 2–3")).toBeInTheDocument();
});
