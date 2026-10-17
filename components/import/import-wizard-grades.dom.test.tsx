import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { importSends, resolveImportClimbs } from "@/actions";

import { ImportWizard } from "./import-wizard";

vi.mock("@/actions", () => ({
  resolveImportClimbs: vi.fn<typeof resolveImportClimbs>(),
  importSends: vi.fn<typeof importSends>(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<() => void>() }),
  usePathname: () => "/account/import",
  useSearchParams: () => new URLSearchParams(),
}));
beforeEach(() => {
  vi.mocked(resolveImportClimbs)
    .mockReset()
    .mockImplementation(async (names) => ({
      ok: true,
      value: names.map((name) => ({
        id: Number(name.slice(6)),
        name,
        key: name.toLowerCase(),
        brokenOn: null,
        areaId: 2,
        areaName: "Wall",
        ancestors: [],
        type: "boulder",
        grade: 4,
        sendCount: 0,
        total: 1,
      })),
    }));
  vi.mocked(importSends)
    .mockReset()
    .mockImplementation(async (rows) => ({
      ok: true,
      value: { imported: rows.length, overwritten: 0, alreadyLogged: 0, missing: [] },
    }));
});

it.each([
  { keep: true, blankGradeMeans: "posted-grade" },
  { keep: false, blankGradeMeans: "no-suggestion" },
] as const)(
  "lists sends a Betabook export leaves ungraded and imports them per the choice (listed grade: $keep)",
  async ({ keep, blankGradeMeans }) => {
    const { container } = render(<ImportWizard profileHref="/users/local" />);
    await userEvent.click(screen.getByRole("button", { name: "CSV file" }));
    const file = new File(
      [
        "Date Sent,Ascent Style,Climb Name,Area Name,Climb Type,Grade,Suggested Grade\n" +
          "2026-03-01,redpoint,Climb 1,Wall,boulder,V3,\n" +
          "2026-03-02,redpoint,Climb 2,Wall,boulder,V3,V4\n",
      ],
      "sends.csv",
      { type: "text/csv" },
    );
    await userEvent.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file);
    await waitFor(() => expect(screen.getByRole("button", { name: "Next: Review" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));

    const region = screen.getByRole("region", { name: "Sends without a suggested grade" });
    expect(region).toHaveTextContent("1 send has no suggested grade");
    expect(within(region).getByRole("listitem")).toHaveTextContent("Climb 1WallV3");
    const choice = within(region).getByRole("checkbox", { name: "Use the climb’s listed grade" });
    expect(choice).toBeChecked();
    if (!keep) await userEvent.click(choice);

    await userEvent.click(screen.getByRole("button", { name: "Import 2 sends" }));
    await screen.findByRole("link", { name: "See your sends" });
    const rows = vi.mocked(importSends).mock.calls.flatMap(([batch]) => batch);
    expect(
      rows.map(({ climbId, gradeText, blankGradeMeans }) => ({
        climbId,
        gradeText,
        blankGradeMeans,
      })),
    ).toEqual([
      { climbId: 1, gradeText: null, blankGradeMeans },
      { climbId: 2, gradeText: "V4", blankGradeMeans: "no-suggestion" },
    ]);
  },
);
