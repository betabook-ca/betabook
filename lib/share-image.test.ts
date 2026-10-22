import { describe, expect, it } from "vitest";

import {
  MAX_SHARE_STATS,
  SHARE_IMAGE_WIDTH,
  STORY_HEIGHT,
  estimateShareImageSize,
  fitText,
  graphemes,
  layoutShareImage,
  shareImageFileName,
  readShareStats,
  statCardRects,
  toggleShareStat,
  trackedMeasure,
  wrapText,
  type ShareImageContent,
  type ShareImageOp,
  type ShareStat,
} from "./share-image";

/** Half the font size per character, so widths are easy to reason about. */
const measure = (text: string, font: string) => {
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? 10);
  return text.length * size * 0.5;
};
const FONTS = { sans: "Sans", display: "Display" };

const STATS: ShareStat[] = [
  { id: "sends", label: "Sends", value: "19", sub: "Sep 2026 – Oct 2026" },
  { id: "hardest", label: "Hardest", value: "5.12c", sub: "L'Utimo Dei Suini" },
  { id: "days", label: "Days out", value: "9", sub: null },
  { id: "flash", label: "Flash", value: "79%", sub: "Hardest: 5.12c" },
  { id: "streak", label: "Longest streak", value: "4 days", sub: "Oct 2026" },
];

const CONTENT: ShareImageContent = {
  title: "Arco 2026",
  status: { label: "On now", tone: "success" },
  dates: "Sep 26, 2026 – Oct 10, 2026",
  description: "Fall arco trip with Ally",
  stats: STATS.slice(0, 4),
};

const texts = (ops: ShareImageOp[]) => ops.flatMap((op) => (op.kind === "text" ? [op.text] : []));
const cards = (ops: ShareImageOp[]) => ops.filter((op) => op.kind === "rect" && op.radius === 32);

describe("layoutShareImage", () => {
  it("fills a 9:16 story and pins the stats to the bottom band", () => {
    const layout = layoutShareImage(CONTENT, "story", FONTS, measure);
    expect(layout).toMatchObject({ width: SHARE_IMAGE_WIDTH, height: STORY_HEIGHT });
    const lastCard = cards(layout.ops).at(-1);
    // Below the middle of the frame; the watermark ends 200px above the bottom, clear of a story reply bar.
    expect(lastCard?.y).toBeGreaterThan(STORY_HEIGHT / 2);
    expect((lastCard?.y ?? 0) + 270 + 32 + 28).toBe(STORY_HEIGHT - 200);
  });

  it("makes a sticker only as tall as its content", () => {
    const layout = layoutShareImage(CONTENT, "sticker", FONTS, measure);
    expect(layout.width).toBe(SHARE_IMAGE_WIDTH);
    expect(layout.height).toBeLessThan(STORY_HEIGHT);
    const watermark = layout.ops.at(-1);
    expect(watermark).toMatchObject({ kind: "text", text: "betabook.ca", align: "center" });
    expect(layout.height - (watermark?.y ?? 0)).toBeGreaterThan(72);
  });

  it("draws the header, upper-cased labels and every chosen stat", () => {
    const { ops } = layoutShareImage(CONTENT, "sticker", FONTS, measure);
    expect(texts(ops)).toEqual([
      "Arco 2026",
      "On now",
      "Sep 26, 2026 – Oct 10, 2026",
      "Fall arco trip with Ally",
      "At a glance",
      "SENDS",
      "19",
      "Sep 2026 – Oct 2026",
      "HARDEST",
      "5.12c",
      "L'Utimo Dei Suini",
      "DAYS OUT",
      "9",
      "FLASH",
      "79%",
      "Hardest: 5.12c",
      "betabook.ca",
    ]);
  });

  it("never draws more than four stats", () => {
    const { ops } = layoutShareImage({ ...CONTENT, stats: STATS }, "story", FONTS, measure);
    expect(cards(ops)).toHaveLength(MAX_SHARE_STATS);
    expect(texts(ops)).not.toContain("LONGEST STREAK");
  });

  it("leaves out the chip and description when the trip has none", () => {
    const { ops } = layoutShareImage(
      { ...CONTENT, status: null, description: null, stats: STATS.slice(0, 1) },
      "sticker",
      FONTS,
      measure,
    );
    expect(texts(ops).slice(0, 3)).toEqual([
      "Arco 2026",
      "Sep 26, 2026 – Oct 10, 2026",
      "At a glance",
    ]);
    expect(ops.filter((op) => op.kind === "rect")).toHaveLength(1);
  });

  it("shortens a long title to leave room for the chip", () => {
    const title = "A very long trip name that would run off the edge of the image";
    const { ops } = layoutShareImage({ ...CONTENT, title }, "story", FONTS, measure);
    const drawn = texts(ops)[0];
    expect(drawn.endsWith("…")).toBe(true);
    const chip = ops.find((op) => op.kind === "rect");
    expect((chip?.x ?? 0) + (chip?.kind === "rect" ? chip.width : 0)).toBeLessThanOrEqual(
      SHARE_IMAGE_WIDTH - 72,
    );
  });
});

describe("statCardRects", () => {
  const width = 936;
  const half = (width - 28) / 2;

  it.each([
    [1, [{ x: 0, y: 0, width }]],
    [
      2,
      [
        { x: 0, y: 0, width: half },
        { x: half + 28, y: 0, width: half },
      ],
    ],
    [
      3,
      [
        { x: 0, y: 0, width: half },
        { x: half + 28, y: 0, width: half },
        { x: 0, y: 298, width },
      ],
    ],
    [
      4,
      [
        { x: 0, y: 0, width: half },
        { x: half + 28, y: 0, width: half },
        { x: 0, y: 298, width: half },
        { x: half + 28, y: 298, width: half },
      ],
    ],
  ])("lays out %i stats", (count, expected) => {
    expect(statCardRects(count, 0, 0, width)).toEqual(
      expected.map((rect) => ({ ...rect, height: 270 })),
    );
  });
});

describe("text fitting", () => {
  it("keeps text that fits and cuts text that doesn't", () => {
    expect(fitText("Sends", 100, "10px Sans", measure)).toBe("Sends");
    expect(fitText("Persistence paid off", 50, "10px Sans", measure)).toBe("Persisten…");
  });

  it("wraps to the line limit and ends the last line with an ellipsis", () => {
    const lines = wrapText(
      "one two three four five six seven eight nine ten",
      60,
      "10px Sans",
      measure,
      2,
    );
    expect(lines).toEqual(["one two", "three four…"]);
  });

  it("cuts a word too wide for its line, not only the last line", () => {
    const lines = wrapText(
      "https://example.com/a/very/long/path then more",
      60,
      "10px Sans",
      measure,
      2,
    );
    expect(lines).toEqual(["https://exa…", "then more"]);
  });

  it("counts letter spacing when cutting a label", () => {
    // 20 characters at 15px fit in 374px untracked, but 19 gaps of 4px don't.
    const label = "PERSISTENCE PAID OFF";
    expect(fitText(label, 374, "30px Sans", measure)).toBe(label);
    const cut = fitText(label, 374, "30px Sans", trackedMeasure(4, measure));
    expect(cut.endsWith("…")).toBe(true);
    expect(trackedMeasure(4, measure)(cut, "30px Sans")).toBeLessThanOrEqual(374);
  });

  it("cuts a long label to fit inside a half-width card", () => {
    const { ops } = layoutShareImage(
      {
        ...CONTENT,
        stats: [
          { id: "persistence", label: "Persistence paid off", value: "3", sub: null },
          STATS[1],
        ],
      },
      "sticker",
      FONTS,
      measure,
    );
    const label = ops.find((op) => op.kind === "text" && op.tracking);
    expect(label?.kind === "text" && label.text.endsWith("…")).toBe(true);
  });
});

describe("emoji", () => {
  const CLIMBER = "🧗‍♀️"; // five UTF-16 units joined into one character

  it("splits text into the characters a reader sees", () => {
    expect(graphemes(`${CLIMBER}🔥a`)).toEqual([CLIMBER, "🔥", "a"]);
  });

  it("never cuts through an emoji", () => {
    // 7 units of room: the climber and the ellipsis fit, half a flame doesn't.
    expect(fitText(`${CLIMBER}🔥🔥`, 35, "10px Sans", measure)).toBe(`${CLIMBER}…`);
  });

  it("spaces tracked text by whole characters", () => {
    const width = trackedMeasure(4, measure)(`${CLIMBER}A`, "10px Sans");
    // 6 units of glyphs plus one 4px gap between the two characters.
    expect(width).toBe(6 * 5 + 4);
  });
});

describe("shareImageFileName", () => {
  it.each([
    ["Été à Fontainebleau", "story", "ete-a-fontainebleau-story.png"],
    ["Arco 2026", "sticker", "arco-2026-sticker.png"],
    ["🧗‍♀️", "story", "trip-story.png"],
  ] as const)("names %j as %s", (title, format, expected) => {
    expect(shareImageFileName(title, format)).toBe(expected);
  });
});

describe("estimateShareImageSize", () => {
  it("matches the drawn size, so the placeholder has the image's shape", () => {
    expect(estimateShareImageSize(CONTENT, "story")).toEqual({ width: 1080, height: STORY_HEIGHT });
    const four = estimateShareImageSize(CONTENT, "sticker");
    expect(four).toEqual({
      width: 1080,
      height: layoutShareImage(CONTENT, "sticker", FONTS, measure).height,
    });
    // A sticker is close to square, not 4:3, and shorter with fewer stats.
    expect(four.height / four.width).toBeGreaterThan(0.9);
    const two = estimateShareImageSize({ ...CONTENT, stats: STATS.slice(0, 2) }, "sticker");
    expect(two.height).toBeLessThan(four.height);
  });
});

describe("stat selection", () => {
  const order = STATS.map((stat) => stat.id);

  it("adds in page order and stops at four", () => {
    expect(toggleShareStat(["days"], "sends", order)).toEqual(["sends", "days"]);
    const full = order.slice(0, 4);
    expect(toggleShareStat(full, "streak", order)).toEqual(full);
    expect(toggleShareStat(full, "hardest", order)).toEqual(["sends", "days", "flash"]);
  });

  it("restores a saved choice limited to this page's stats", () => {
    expect(readShareStats(JSON.stringify(["streak", "sends", "bestYear"]), order)).toEqual([
      "sends",
      "streak",
    ]);
    expect(readShareStats(JSON.stringify(order), order)).toHaveLength(MAX_SHARE_STATS);
  });

  it.each([null, "", "not json", "{}", "[]", JSON.stringify(["bestYear"]), "[1, 2]"])(
    "falls back to the first four for %j",
    (saved) => {
      expect(readShareStats(saved, order)).toEqual(order.slice(0, 4));
    },
  );
});
