import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ImportDateWarning } from "./import-date-warning";

it("shows the concentration and preserves dates until explicitly selected", async () => {
  const dates = new Set<string>();
  const onChange = vi.fn<(dates: Set<string>) => void>();
  const props = {
    clusters: [{ date: "2025-09-03", count: 49, datedCount: 60 }],
    undatedDates: dates,
    onChange,
  };
  const { rerender } = render(<ImportDateWarning {...props} />);
  expect(screen.getByRole("region", { name: "Review repeated dates" })).toHaveTextContent(
    "49 of 60 dated sends (82%)",
  );
  const choice = screen.getByRole("checkbox", {
    name: "Import sends dated Sep 3, 2025 without dates",
  });
  expect(choice).not.toBeChecked();
  expect(onChange).not.toHaveBeenCalled();
  await userEvent.click(choice);
  expect(onChange).toHaveBeenLastCalledWith(new Set(["2025-09-03"]));
  expect(dates.size).toBe(0);
  rerender(<ImportDateWarning {...props} undatedDates={new Set(["2025-09-03"])} />);
  await userEvent.click(choice);
  expect(onChange).toHaveBeenLastCalledWith(new Set());
});

it("hides empty warnings and locks choices while importing", () => {
  const onChange = vi.fn<(dates: Set<string>) => void>();
  const { rerender } = render(
    <ImportDateWarning clusters={[]} undatedDates={new Set()} onChange={onChange} />,
  );
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  rerender(
    <ImportDateWarning
      clusters={[{ date: "2025-09-03", count: 49, datedCount: 60 }]}
      undatedDates={new Set()}
      onChange={onChange}
      disabled
    />,
  );
  expect(screen.getByRole("checkbox")).toBeDisabled();
});
