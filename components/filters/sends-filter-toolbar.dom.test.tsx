import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";

import { UserSendsFilterToolbar } from "./sends-filter-toolbar";

const { replace } = vi.hoisted(() => ({ replace: vi.fn<(href: string) => void>() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn<(href: string) => void>() }),
  usePathname: () => "/users/sample/sends",
  useSearchParams: () => new URLSearchParams("areaName=Cedar&sort=date_desc"),
}));

it("clears a legacy area name from its single chip", async () => {
  const user = userEvent.setup();
  render(
    <UserSendsFilterToolbar
      filter={{ ...DEFAULT_USER_SENDS_FILTER, areaName: "Cedar" }}
      basePath="/users/sample/sends"
    />,
  );
  await user.click(screen.getByRole("button", { name: "Expand filters" }));

  const controls = screen.getAllByRole("button", { name: /Cedar/ });
  expect(controls.map((control) => control.getAttribute("aria-label"))).toEqual([
    "Remove Area: Cedar",
  ]);

  await user.click(controls[0]);
  expect(screen.queryByRole("button", { name: /Cedar/ })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith("/users/sample/sends?sort=date_desc", { scroll: false }),
  );
});
