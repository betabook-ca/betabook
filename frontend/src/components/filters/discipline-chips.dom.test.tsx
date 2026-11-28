import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { Discipline } from "@/lib/grades";

import { DisciplineChips } from "./discipline-chips";

it("in single mode, pressing one of several chosen disciplines removes only that one", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn<(value: Discipline[]) => void>();
  render(<DisciplineChips single value={["boulder", "sport"]} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "Boulder" }));
  expect(onChange).toHaveBeenLastCalledWith(["sport"]);
});

it("in single mode, choosing a new discipline replaces the others", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn<(value: Discipline[]) => void>();
  render(<DisciplineChips single value={["boulder"]} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "Trad" }));
  expect(onChange).toHaveBeenLastCalledWith(["trad"]);
});
