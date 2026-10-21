import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ShareImageContent, ShareImageFormat, ShareStat } from "@/lib/share-image";

import { SHARE_STATS_STORAGE_KEY, TripShareImage } from "./trip-share-image";

const CONTENT = {
  title: "Arco 2026",
  status: { label: "On now", tone: "success" as const },
  dates: "Sep 26, 2026 – Oct 10, 2026",
  description: "Fall arco trip with Ally",
};

const STATS: ShareStat[] = [
  { id: "sends", label: "Sends", value: "19", sub: null },
  { id: "hardest", label: "Hardest", value: "5.12c", sub: null },
  { id: "days", label: "Days out", value: "9", sub: null },
  { id: "firstTry", label: "Flash", value: "79%", sub: null },
  { id: "streak", label: "Longest streak", value: "4 days", sub: null },
];

const renderImage =
  vi.fn<(content: ShareImageContent, format: ShareImageFormat) => Promise<Blob>>();
let urls = 0;

beforeEach(() => {
  localStorage.clear();
  urls = 0;
  renderImage.mockReset().mockImplementation(async () => new Blob(["png"], { type: "image/png" }));
  // jsdom has no object URLs.
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => `blob:preview-${(urls += 1)}`,
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const drawnIds = () => renderImage.mock.calls.at(-1)?.[0].stats.map((stat) => stat.id) ?? [];

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Share image" }));
  const dialog = await screen.findByRole("dialog", { name: "Share as image" });
  await within(dialog).findByRole("img", { name: /^Preview/ });
  return dialog;
}

it("starts with the first four stats and blocks a fifth", async () => {
  const user = userEvent.setup();
  render(<TripShareImage content={CONTENT} stats={STATS} render={renderImage} />);
  const dialog = await open(user);

  expect(drawnIds()).toEqual(["sends", "hardest", "days", "firstTry"]);
  expect(renderImage).toHaveBeenLastCalledWith(
    expect.objectContaining({ ...CONTENT, description: null }),
    "story",
  );
  expect(within(dialog).getByText("4 of 4 selected")).toBeVisible();
  expect(within(dialog).getByRole("checkbox", { name: "Longest streak" })).toBeDisabled();
  expect(within(dialog).getByRole("checkbox", { name: "Sends" })).toBeChecked();
  expect(within(dialog).getByRole("checkbox", { name: "Include description" })).not.toBeChecked();
});

it("adds the description when chosen and remembers it", async () => {
  const user = userEvent.setup();
  const { unmount } = render(
    <TripShareImage content={CONTENT} stats={STATS} render={renderImage} />,
  );
  let dialog = await open(user);

  await user.click(within(dialog).getByRole("checkbox", { name: "Include description" }));
  await within(dialog).findByRole("img", { name: /^Preview/ });
  expect(renderImage.mock.calls.at(-1)?.[0].description).toBe("Fall arco trip with Ally");
  // The stats stay as they were.
  expect(drawnIds()).toEqual(["sends", "hardest", "days", "firstTry"]);

  unmount();
  render(<TripShareImage content={CONTENT} stats={STATS} render={renderImage} />);
  dialog = await open(user);
  expect(within(dialog).getByRole("checkbox", { name: "Include description" })).toBeChecked();
  expect(renderImage.mock.calls.at(-1)?.[0].description).toBe("Fall arco trip with Ally");
});

it("offers no description option for a trip without one", async () => {
  const user = userEvent.setup();
  render(
    <TripShareImage
      content={{ ...CONTENT, description: null }}
      stats={STATS}
      render={renderImage}
    />,
  );
  const dialog = await open(user);
  expect(
    within(dialog).queryByRole("checkbox", { name: "Include description" }),
  ).not.toBeInTheDocument();
});

it("keeps page order, redraws and remembers the choice", async () => {
  const user = userEvent.setup();
  const { unmount } = render(
    <TripShareImage content={CONTENT} stats={STATS} render={renderImage} />,
  );
  let dialog = await open(user);

  await user.click(within(dialog).getByRole("checkbox", { name: "Sends" }));
  await user.click(within(dialog).getByRole("checkbox", { name: "Longest streak" }));
  await within(dialog).findByRole("img", { name: /^Preview/ });

  expect(drawnIds()).toEqual(["hardest", "days", "firstTry", "streak"]);
  expect(JSON.parse(localStorage.getItem(SHARE_STATS_STORAGE_KEY) ?? "null")).toEqual([
    "hardest",
    "days",
    "firstTry",
    "streak",
  ]);

  unmount();
  render(<TripShareImage content={CONTENT} stats={STATS} render={renderImage} />);
  dialog = await open(user);
  expect(within(dialog).getByRole("checkbox", { name: "Longest streak" })).toBeChecked();
  expect(within(dialog).getByRole("checkbox", { name: "Sends" })).not.toBeChecked();
});

it("disables the actions with no stats chosen", async () => {
  const user = userEvent.setup();
  localStorage.setItem(SHARE_STATS_STORAGE_KEY, JSON.stringify(["sends"]));
  render(<TripShareImage content={CONTENT} stats={STATS} render={renderImage} />);
  const dialog = await open(user);

  await user.click(within(dialog).getByRole("checkbox", { name: "Sends" }));
  expect(within(dialog).getByText("Choose at least one stat.")).toBeVisible();
  expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
});

it("draws a sticker when chosen", async () => {
  const user = userEvent.setup();
  render(<TripShareImage content={CONTENT} stats={STATS} render={renderImage} />);
  const dialog = await open(user);

  await user.click(within(dialog).getByRole("button", { name: "Sticker" }));
  await within(dialog).findByRole("img", { name: /^Preview/ });
  expect(renderImage).toHaveBeenLastCalledWith(expect.anything(), "sticker");
});

it("shows only the latest preview when draws finish out of order", async () => {
  const user = userEvent.setup();
  let resolveSlow: (blob: Blob) => void = () => {};
  const slowDraw = new Promise<Blob>((resolve) => (resolveSlow = resolve));
  renderImage
    .mockImplementationOnce(async () => new Blob(["first"]))
    .mockImplementationOnce(() => slowDraw);
  render(<TripShareImage content={CONTENT} stats={STATS} render={renderImage} />);
  const dialog = await open(user);

  // The sticker draw stalls; switching back to story draws again and wins.
  await user.click(within(dialog).getByRole("button", { name: "Sticker" }));
  await user.click(within(dialog).getByRole("button", { name: /^Story/ }));
  const latest = await within(dialog).findByRole("img", { name: /^Preview/ });
  const src = latest.getAttribute("src");
  resolveSlow(new Blob(["stale"]));
  await waitFor(() => expect(renderImage).toHaveBeenCalledTimes(3));
  expect(within(dialog).getByRole("img", { name: /^Preview/ })).toHaveAttribute("src", src);
});

it("copies the image where the browser supports it", async () => {
  const user = userEvent.setup();
  const write = vi.fn<(items: ClipboardItem[]) => Promise<void>>().mockResolvedValue(undefined);
  vi.stubGlobal(
    "ClipboardItem",
    class {
      public readonly items: Record<string, Blob>;
      public constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    },
  );
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
  render(<TripShareImage content={CONTENT} stats={STATS} render={renderImage} />);
  const dialog = await open(user);

  await user.click(screen.getByRole("button", { name: "Copy" }));
  expect(write).toHaveBeenCalledOnce();
  expect(write.mock.calls[0][0][0]).toMatchObject({ items: { "image/png": expect.any(Blob) } });
  expect(within(dialog).getByRole("status")).toHaveTextContent("Copied.");
});

it("reports a failed draw", async () => {
  const user = userEvent.setup();
  renderImage.mockRejectedValue(new Error("no canvas"));
  render(<TripShareImage content={CONTENT} stats={STATS} render={renderImage} />);
  await user.click(screen.getByRole("button", { name: "Share image" }));
  const dialog = await screen.findByRole("dialog", { name: "Share as image" });
  expect(await within(dialog).findByText("Couldn't draw the image. Try again.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
});
