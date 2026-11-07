import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { AreaClimbsToolbar } from "@/components/filters/area-climbs-toolbar";
import { ClimbFilterControls } from "@/components/filters/climb-filter-controls";
import { DEFAULT_AREA_CLIMBS_FILTER } from "@/lib/filters/area-climbs-filter";
import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import type { ClimbFilterState } from "@/lib/filters/climb-filter-state";

const replace = vi.fn<(href: string, options?: unknown) => void>();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn<(href: string) => void>() }),
  usePathname: () => "/areas/2/test-boulders",
}));

beforeEach(() => replace.mockReset());

function SearchFilters({ showExcludeSent }: { showExcludeSent: boolean }) {
  const [value, setValue] = useState<ClimbFilterState>({
    sort: "name_asc",
    area: null,
    filter: DEFAULT_CLIMB_FILTER,
  });
  return (
    <>
      <ClimbFilterControls value={value} onChange={setValue} showExcludeSent={showExcludeSent} />
      <output>{value.filter.excludeSent ? "excluding" : "including"}</output>
    </>
  );
}

it("offers Exclude sent in the climb filters only when asked to, and sets the filter", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<SearchFilters showExcludeSent={false} />);
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(screen.queryByRole("checkbox", { name: "Exclude sent" })).not.toBeInTheDocument();
  unmount();

  render(<SearchFilters showExcludeSent />);
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  await user.click(screen.getByRole("checkbox", { name: "Exclude sent" }));
  expect(screen.getByRole("status")).toHaveTextContent("excluding");
  // Its chip clears it.
  await user.click(screen.getByRole("button", { name: "Remove Excluding sent" }));
  expect(screen.getByRole("status")).toHaveTextContent("including");
});

it("writes Exclude sent into an area's climb list URL", async () => {
  const user = userEvent.setup();
  render(
    <AreaClimbsToolbar
      areaPath="/areas/2/test-boulders"
      sort="name_asc"
      filter={DEFAULT_AREA_CLIMBS_FILTER}
      showExcludeSent
    />,
  );
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  await user.click(screen.getByRole("checkbox", { name: "Exclude sent" }));
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("excludeSent=1"), {
      scroll: false,
    }),
  );
});
