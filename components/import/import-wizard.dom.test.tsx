import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { importSends, resolveImportClimbs } from "@/actions";
import { kayaStreamResponse } from "@/test/kaya";

import { ImportWizard } from "./import-wizard";

vi.mock("@/actions", () => ({
  resolveImportClimbs: vi.fn<typeof resolveImportClimbs>().mockResolvedValue({
    ok: true,
    value: [
      {
        id: 1,
        areaId: 2,
        name: "Test climb",
        key: "test climb",
        type: "sport",
        grade: 18,
        sendCount: 1,
        areaName: "Wall",
        ancestors: [],
        total: 1,
      },
    ],
  }),
  importSends: vi.fn<typeof importSends>(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<() => void>() }),
  usePathname: () => "/account/import",
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
});

it("takes public API data straight to matching and review without writing sends", async () => {
  const envelope = (json: unknown) => Response.json({ result: { data: { json } } });
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        envelope({ profile: { id: 42, slug: "climber", isPrivate: false, totalSends: 2 } }),
      )
      .mockResolvedValueOnce(
        envelope({
          items: [
            {
              type: "sends",
              day: "2026-08-16",
              assets: [],
              sends: [
                {
                  id: 200,
                  climb: {
                    id: 100,
                    name: "Test climb",
                    type: "sport",
                    gradeId: 62,
                    area: { name: "Wall" },
                  },
                  sendType: "redpoint",
                  gradeId: 62,
                  day: "2026-08-16",
                  rating: 5,
                  difficulty: 0,
                  comments: "Great &amp; sunny",
                },
              ],
            },
          ],
        }),
      ),
  );
  render(<ImportWizard profileHref="/users/local" />);
  await userEvent.type(
    screen.getByRole("textbox", { name: "Sendage username or profile link" }),
    "climber",
  );
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  await waitFor(() => expect(resolveImportClimbs).toHaveBeenCalledExactlyOnceWith(["Test climb"]));
  expect(screen.getByText(/Sendage profile @climber/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "support@betabook.ca" })).toHaveAttribute(
    "href",
    expect.stringMatching(
      /^mailto:support@betabook\.ca\?subject=Sendage%20profile%20%40climber&body=Sendage%20lists%202%20sends/,
    ),
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Next: Review" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
  expect(screen.getByText("Will import").parentElement).toHaveTextContent("1");
  expect(importSends).not.toHaveBeenCalled();
});

it("loads KAYA routes into matching and review with visible style limitations", async () => {
  vi.mocked(resolveImportClimbs).mockClear();
  vi.mocked(importSends).mockClear();
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(kayaStreamResponse([], 0))
      .mockResolvedValueOnce(
        kayaStreamResponse(
          [
            {
              id: "ascent",
              date: "2026-08-16T09:00:00.000Z",
              rating: 4,
              stiffness: 0,
              comment: "Fun",
              grade: { name: "5.12a" },
              climb: {
                id: "climb",
                name: "Test climb",
                climb_type: { id: "2", name: "Routes" },
                grade: { name: "5.12a" },
                gym: null,
                board: null,
                destination: { name: "Squamish" },
                area: { name: "Wall" },
              },
            },
          ],
          1,
        ),
      ),
  );
  render(<ImportWizard profileHref="/users/local" />);
  await userEvent.click(screen.getByRole("button", { name: "KAYA" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "KAYA username or profile link" }),
    "https://kaya-app.kayaclimb.com/user/suzilu",
  );
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  await waitFor(() => expect(resolveImportClimbs).toHaveBeenCalledExactlyOnceWith(["Test climb"]));
  expect(screen.getByText(/KAYA profile @suzilu/)).toBeInTheDocument();
  expect(screen.getByText(/Sends are imported as redpoints/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Next: Review" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
  expect(screen.getByText("Will import").parentElement).toHaveTextContent("1");
  expect(importSends).not.toHaveBeenCalled();
});

it("loads a Mountain Project tick export into matching and review", async () => {
  vi.mocked(resolveImportClimbs).mockClear();
  vi.mocked(importSends).mockClear();
  const csv = [
    'Date,Route,Rating,Notes,URL,Pitches,Location,"Avg Stars","Your Stars",Style,"Lead Style","Route Type","Your Rating",Length,"Rating Code"',
    '2026-08-16,"Test climb",5.12a,"Fun",https://www.mountainproject.com/route/1/x,1,"Squamish > Wall",3.3,4,Lead,Redpoint,Sport,5.12a,60,3200',
    '2026-08-17,"Test climb",5.12a,,https://www.mountainproject.com/route/1/x,1,"Squamish > Wall",3.3,4,TR,,Sport,,60,3200',
  ].join("\n");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "X-Mountain-Project-User": "eric-bonilla",
        },
      }),
    ),
  );
  render(<ImportWizard profileHref="/users/local" />);
  await userEvent.click(screen.getByRole("button", { name: "Mountain Project" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "Mountain Project user ID or profile link" }),
    "https://www.mountainproject.com/user/200226064/eric-bonilla/ticks",
  );
  await userEvent.click(screen.getByRole("button", { name: "Load ticks" }));
  await waitFor(() => expect(resolveImportClimbs).toHaveBeenCalledExactlyOnceWith(["Test climb"]));
  expect(screen.getByText(/Mountain Project profile @eric-bonilla/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Next: Review" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Next: Review" }));
  expect(screen.getByText("Will import").parentElement).toHaveTextContent("1");
  expect(screen.getByText(/Unmapped ascent style value "TR"/)).toBeInTheDocument();
  expect(importSends).not.toHaveBeenCalled();
});

it("disables competing import sources while KAYA is loading and releases them on cancel", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockReturnValue(new Promise(() => {})));
  render(<ImportWizard profileHref="/users/local" />);
  await userEvent.click(screen.getByRole("button", { name: "KAYA" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "KAYA username or profile link" }),
    "suzilu",
  );
  await userEvent.click(screen.getByRole("button", { name: "Load sends" }));
  expect(screen.getByRole("button", { name: "Sendage" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "CSV file" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Sendage" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "CSV file" })).toBeEnabled();
});
