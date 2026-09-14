import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { importSends, resolveImportClimbs } from "@/actions";
import { RESOLVE_BATCH_SIZE } from "@/lib/sends";
import { kayaStreamResponse } from "@/test/kaya";

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

type Lookup = { names: string[]; settle: () => void };
let pending: Lookup[] = [];

beforeEach(() => {
  pending = [];
  vi.mocked(resolveImportClimbs)
    .mockReset()
    .mockImplementation(
      (names) =>
        new Promise((resolve) => {
          pending.push({
            names,
            settle: () =>
              resolve({
                ok: true,
                value: names.map((name) => ({
                  id: Number(name.slice(6)),
                  name,
                  key: name.toLowerCase(),
                  areaId: 2,
                  areaName: "Wall",
                  ancestors: [],
                  type: "boulder" as const,
                  grade: 4,
                  sendCount: 0,
                  total: 1,
                })),
              }),
          });
        }),
    );
  vi.mocked(importSends)
    .mockReset()
    .mockImplementation(async (rows) => ({
      ok: true,
      value: { imported: rows.length, overwritten: 0, alreadyLogged: 0, missing: [] },
    }));
});
afterEach(() => vi.unstubAllGlobals());

const CHUNKS = 3;
const CLIMBS = RESOLVE_BATCH_SIZE * CHUNKS;

async function startKayaLoad() {
  const items = Array.from({ length: CLIMBS }, (_, i) => ({
    id: String(i + 1),
    date: "2026-03-18T12:00:00.000Z",
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
      .mockResolvedValueOnce(kayaStreamResponse(items, CLIMBS, "Chichiaventurero"))
      .mockResolvedValueOnce(kayaStreamResponse([], 0, "Chichiaventurero")),
  );
  render(<ImportWizard profileHref="/users/local" />);
  await userEvent.click(screen.getByRole("button", { name: "KAYA" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "KAYA username or profile link" }),
    "Chichiaventurero",
  );
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
}

it("resolves every lookup chunk concurrently instead of one round trip at a time", async () => {
  await startKayaLoad();

  await waitFor(() => expect(pending).toHaveLength(CHUNKS));
  expect(pending.flatMap((lookup) => lookup.names)).toHaveLength(CLIMBS);
});

it("matches every climb when the lookups settle out of order", async () => {
  await startKayaLoad();
  await waitFor(() => expect(pending).toHaveLength(CHUNKS));

  for (const index of [2, 0, 1]) pending[index].settle();

  await waitFor(() => expect(screen.getByRole("button", { name: "Next: Review" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
  expect(screen.getByText("Will import").parentElement).toHaveTextContent(String(CLIMBS));
});
