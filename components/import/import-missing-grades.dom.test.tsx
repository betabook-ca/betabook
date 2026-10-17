import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ClimbCandidate } from "@/db/queries";

import { ImportMissingGrades } from "./import-missing-grades";

function climb(overrides: Partial<ClimbCandidate> & { id: number }): ClimbCandidate {
  return {
    name: "Chicken Joe",
    key: "chicken joe",
    type: "sport",
    grade: 14,
    areaId: 1,
    areaName: "Echo Beach",
    sendCount: 0,
    brokenOn: null,
    ancestors: [],
    total: 1,
    ...overrides,
  };
}

it("counts and lists the climbs and toggles the listed-grade fallback", async () => {
  const onChange = vi.fn<(useListedGrade: boolean) => void>();
  const climbs = [
    climb({ id: 1 }),
    climb({ id: 2, name: "Ungraded Problem", type: "boulder", grade: null }),
  ];
  const { rerender } = render(
    <ImportMissingGrades climbs={climbs} useListedGrade onChange={onChange} />,
  );
  const region = screen.getByRole("region", { name: "Sends without a suggested grade" });
  expect(region).toHaveTextContent("2 sends have no suggested grade");
  const items = within(within(region).getByRole("list")).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "Chicken JoeEcho Beach5.11a",
    "Ungraded ProblemEcho Beach—",
  ]);
  const choice = screen.getByRole("checkbox", { name: "Use the climb’s listed grade" });
  expect(choice).toBeChecked();
  await userEvent.click(choice);
  expect(onChange).toHaveBeenLastCalledWith(false);
  rerender(<ImportMissingGrades climbs={climbs} useListedGrade={false} onChange={onChange} />);
  expect(region).toHaveTextContent("These sends will import without a suggested grade.");
});

it("hides when every climb has a grade and locks the choice while importing", () => {
  const onChange = vi.fn<(useListedGrade: boolean) => void>();
  const { rerender } = render(
    <ImportMissingGrades climbs={[]} useListedGrade onChange={onChange} />,
  );
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  rerender(
    <ImportMissingGrades climbs={[climb({ id: 1 })]} useListedGrade onChange={onChange} disabled />,
  );
  expect(screen.getByRole("checkbox")).toBeDisabled();
});
