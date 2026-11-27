import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { importSends, resolveImportClimbs } from "@/spa/lib/actions-client";
import ImportRoute from "@/spa/routes/import-route";
import { kayaStreamResponse } from "@/tests/vitest/kaya";

import { ImportWizard } from "./import-wizard";

vi.mock("@/spa/lib/actions-client", () => ({
  resolveImportClimbs: vi.fn<typeof resolveImportClimbs>(),
  importSends: vi.fn<typeof importSends>(),
}));
vi.mock("@/spa/lib/navigation", () => ({
  useRouter: () => ({ push: vi.fn<() => void>() }),
  usePathname: () => "/account/import",
  useSearchParams: () => new URLSearchParams(),
}));
let unmatched: string | null = null;
beforeEach(() => {
  unmatched = null;
  vi.mocked(resolveImportClimbs)
    .mockReset()
    .mockImplementation(async (names) => ({
      ok: true,
      // A real catalog holds these names only; spelling variants find nothing.
      value: names
        .filter((name) => name !== unmatched && /^Climb \d+$/.test(name))
        .map((name) => ({
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
afterEach(() => vi.unstubAllGlobals());

async function loadKaya() {
  render(<ImportRoute viewerId="local" />);
  await enterKaya();
}

async function enterKaya() {
  const items = Array.from({ length: 60 }, (_, i) => ({
    id: String(i + 1),
    date: `${i < 49 ? "2025-09-03" : i < 58 ? "2026-03-18" : "2026-03-14"}T12:00:00.000Z`,
    comment: "Great climb",
    rating: 4,
    stiffness: 0,
    grade: { name: "v3" },
    climb: {
      id: String(i + 1),
      name: `Climb ${i + 1}`,
      climb_type: { id: "1", name: "Bouldering" },
      grade: { name: "v3" },
      gym: null,
      board: null,
      area: { name: "Wall" },
      destination: { name: "Crag" },
    },
  }));
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(kayaStreamResponse(items, 60, "Chichiaventurero"))
      .mockResolvedValueOnce(kayaStreamResponse([], 0, "Chichiaventurero")),
  );
  await userEvent.click(screen.getByRole("button", { name: "KAYA" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "KAYA username or profile link" }),
    "Chichiaventurero",
  );
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  await screen.findByRole("region", { name: "Review repeated dates" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Next: Review" })).toBeEnabled());
}

it.each(["Back to matching", "Check them"])(
  "locks %s while importing so progress and cancellation stay available",
  async (navigation) => {
    if (navigation === "Back to matching") unmatched = "Climb 60";
    else {
      const lookup = vi.mocked(resolveImportClimbs).getMockImplementation()!;
      vi.mocked(resolveImportClimbs).mockImplementation(async (names) => {
        const result = await lookup(names);
        if (!result.ok) return result;
        const [first, ...rest] = result.value;
        return {
          ok: true,
          value: [
            { ...first, total: 2 },
            { ...first, id: first.id + 1000, grade: first.grade! + 1, total: 2 },
            ...rest,
          ],
        };
      });
    }
    const readyCount = navigation === "Back to matching" ? 59 : 60;
    let finish!: () => void;
    vi.mocked(importSends).mockImplementationOnce(
      (rows) =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              ok: true,
              value: { imported: rows.length, overwritten: 0, alreadyLogged: 0, missing: [] },
            });
        }),
    );
    await loadKaya();
    await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
    await userEvent.click(screen.getByRole("button", { name: `Import ${readyCount} sends` }));
    const link = screen.getByRole("button", { name: navigation });
    expect(link).toBeDisabled();
    expect(screen.getByText("5 Review", { exact: true })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("progressbar", { name: "Importing sends" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByRole("button", { name: "Cancel import" })).toBeEnabled();
    await userEvent.click(link);
    expect(screen.getByText("5 Review", { exact: true })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Cancel import" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Next: Review" })).not.toBeInTheDocument();
    expect(importSends).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(await screen.findByRole("link", { name: "See your sends" })).toHaveAttribute(
      "href",
      "/users/local",
    );
    expect(screen.getByRole("button", { name: "Import another file" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel import" })).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { name: "Importing sends" })).not.toBeInTheDocument();
    const batches = vi.mocked(importSends).mock.calls.map(([rows]) => rows);
    expect(batches.map((rows) => rows.length)).toEqual([50, readyCount - 50]);
    expect(batches.flatMap((rows) => rows.map((row) => row.climbId))).toEqual(
      Array.from({ length: readyCount }, (_, index) => index + 1),
    );
    expect(screen.getByText("Imported", { exact: true }).nextElementSibling).toHaveTextContent(
      new RegExp(`^${readyCount}$`),
    );
  },
);

it("warns on an automatically mapped KAYA import and keeps all dates by default", async () => {
  await loadKaya();
  expect(screen.getByRole("region", { name: "Review repeated dates" })).toHaveTextContent(
    "49 of 60 dated sends (82%)",
  );
  expect(
    screen.getByRole("checkbox", { name: /Import sends dated Sep 3, 2025 without dates/ }),
  ).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
  expect(screen.getByRole("region", { name: "Review repeated dates" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Import 60 sends" }));
  await waitFor(() => expect(screen.getByText("Imported").parentElement).toHaveTextContent("60"));
  expect(vi.mocked(importSends).mock.calls.map(([, options]) => options.expectedOwnerId)).toEqual([
    "local",
    "local",
  ]);
  const submitted = vi.mocked(importSends).mock.calls.flatMap(([rows]) => rows);
  expect(submitted.filter((row) => row.dateSent === "2025-09-03")).toHaveLength(49);
  expect(submitted.filter((row) => row.dateSent === null)).toHaveLength(0);
});

it("clears only the flagged dates, preserves a manual skip, and avoids repeating climb lookups", async () => {
  unmatched = "Climb 60";
  await loadKaya();
  await userEvent.click(screen.getByRole("button", { name: "Skip all unresolved" }));
  const lookups = vi.mocked(resolveImportClimbs).mock.calls.length;
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Import sends dated Sep 3, 2025 without dates/ }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
  expect(screen.getByText("Skipped").parentElement).toHaveTextContent("1");
  expect(
    screen.getByRole("checkbox", { name: /Import sends dated Sep 3, 2025 without dates/ }),
  ).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Import 59 sends" }));
  await waitFor(() => expect(screen.getByText("Imported").parentElement).toHaveTextContent("59"));
  expect(resolveImportClimbs).toHaveBeenCalledTimes(lookups);
  expect(vi.mocked(importSends).mock.calls.map(([, options]) => options.expectedOwnerId)).toEqual([
    "local",
    "local",
  ]);
  const submitted = vi.mocked(importSends).mock.calls.flatMap(([rows]) => rows);
  expect(submitted.filter((row) => row.dateSent === null)).toHaveLength(49);
  expect(submitted.filter((row) => row.dateSent === "2026-03-18")).toHaveLength(9);
  expect(submitted.filter((row) => row.dateSent === "2026-03-14")).toHaveLength(1);
  expect(submitted[0]).toMatchObject({
    climbId: 1,
    gradeText: "V3",
    rating: 4,
    comment: "Great climb",
    ascentStyle: "redpoint",
  });
});

it("groups CSV timestamps by the imported calendar date and resets choices for a new file", async () => {
  const { container } = render(<ImportWizard profileHref="/users/local" />);
  await userEvent.click(screen.getByRole("button", { name: "CSV file" }));
  const lines = Array.from(
    { length: 30 },
    (_, i) =>
      `${i < 20 ? `2025-09-03T${String(i).padStart(2, "0")}:00:00Z` : `2026-03-${String(i - 19).padStart(2, "0")}`},redpoint,Climb ${i + 1},Wall,boulder,V3`,
  );
  const file = new File(
    ["Date Sent,Ascent Style,Climb Name,Area Name,Climb Type,Grade\n" + lines.join("\n")],
    "sends.csv",
    { type: "text/csv" },
  );
  // user-event supplies a native chooser result to the hidden input, which is
  // normally opened by the visible CSV dropzone.
  await userEvent.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file);
  expect(await screen.findByRole("region", { name: "Review repeated dates" })).toHaveTextContent(
    "20 of 30 dated sends (67%)",
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Import sends dated Sep 3, 2025 without dates/ }),
  );
  await userEvent.click(screen.getByRole("button", { name: "1 Upload" }));
  await userEvent.click(screen.getByRole("button", { name: "CSV file" }));
  await userEvent.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file);
  expect(
    await screen.findByRole("checkbox", { name: /Import sends dated Sep 3, 2025 without dates/ }),
  ).not.toBeChecked();
});

it("starts the next import from a clean wizard", async () => {
  await loadKaya();
  await userEvent.click(
    screen.getByRole("checkbox", { name: /Import sends dated Sep 3, 2025 without dates/ }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
  await userEvent.click(screen.getByRole("button", { name: "Overwrite" }));
  await userEvent.click(screen.getByRole("button", { name: "Import 60 sends" }));
  await userEvent.click(await screen.findByRole("button", { name: "Import another file" }));
  expect(importSends).toHaveBeenLastCalledWith(
    expect.any(Array),
    expect.objectContaining({ onConflict: "overwrite" }),
  );

  expect(screen.getByText("1 Upload", { exact: true })).toHaveAttribute("aria-current", "step");
  expect(screen.getByRole("button", { name: "Sendage" })).toHaveAttribute("aria-pressed", "true");
  await enterKaya();
  expect(
    screen.getByRole("checkbox", { name: /Import sends dated Sep 3, 2025 without dates/ }),
  ).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
  expect(screen.getByRole("button", { name: "Skip" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText(/replace your existing send data/)).not.toBeInTheDocument();
});

it.each(["saved", "unconfirmed"] as const)(
  "starts no more writes after leaving a wizard with a %s batch response",
  async (outcome) => {
    let finish!: (result: Awaited<ReturnType<typeof importSends>>) => void;
    const first = new Promise<Awaited<ReturnType<typeof importSends>>>((resolve) => {
      finish = resolve;
    });
    vi.mocked(importSends).mockReturnValueOnce(first);
    const { rerender } = render(<ImportRoute viewerId="local" />);
    await enterKaya();
    await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Import 60 sends" }));
    expect(importSends).toHaveBeenCalledTimes(1);
    rerender(<ImportRoute viewerId="next-viewer" />);
    expect(screen.getByText("1 Upload", { exact: true })).toHaveAttribute("aria-current", "step");
    await act(async () => {
      finish(
        outcome === "saved"
          ? { ok: true, value: { imported: 50, overwritten: 0, alreadyLogged: 0, missing: [] } }
          : { ok: false, error: "Unconfirmed", outcome: "unknown" },
      );
    });
    expect(importSends).toHaveBeenCalledTimes(1);
  },
);
