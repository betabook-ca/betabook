import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { LookupFetcher } from "@/hooks/use-search-lookup";
import type { CompanionOption } from "@/lib/journal-companions";

import { EMPTY_TRIP_DRAFT, TripForm } from "./trip-form";

const friends = vi.fn<LookupFetcher<CompanionOption>>().mockResolvedValue([]);

it("locks every field while the trip is saving", () => {
  render(
    <TripForm
      draft={{ ...EMPTY_TRIP_DRAFT, name: "Bishop", startDate: "2026-03-10" }}
      onChange={vi.fn<() => void>()}
      companionFetcher={friends}
      disabled
    />,
  );
  for (const name of ["Name", "Description", "Google Photos album"]) {
    expect(screen.getByRole("textbox", { name })).toBeDisabled();
  }
  for (const label of ["Start date", "End date"]) {
    expect(screen.getByRole("spinbutton", { name: `month, ${label}` })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  }
});
