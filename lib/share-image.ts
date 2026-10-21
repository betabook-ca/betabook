import type { AnalyticsCardId } from "@/lib/analytics-layout";
import { SITE_URL } from "@/lib/site";
import { slugify } from "@/lib/slug";

/** `story` fills a 9:16 phone story with clear space in the middle for the
 * photo underneath. `sticker` is only as tall as its content. */
export type ShareImageFormat = "story" | "sticker";

export type ShareStat = {
  id: AnalyticsCardId;
  label: string;
  value: string;
  sub: string | null;
};

export type ShareImageContent = {
  title: string;
  status: { label: string; tone: "success" | "default" } | null;
  dates: string;
  description: string | null;
  /** One to four, in page order. */
  stats: ShareStat[];
};

export type ShareImageFonts = { sans: string; display: string };

/** Width of the text in pixels for a canvas `font` string. */
export type MeasureText = (text: string, font: string) => number;

type TextOp = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
  align?: "left" | "center";
  /** Letter spacing in pixels. Canvas `letterSpacing` is missing in Safari
   * 16.4, so tracked text is drawn one character at a time. */
  tracking?: number;
};

type RectOp = {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fill: string;
};

export type ShareImageOp = TextOp | RectOp;

export type ShareImageLayout = { width: number; height: number; ops: ShareImageOp[] };

export const MAX_SHARE_STATS = 4;

export const SHARE_IMAGE_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
const PAD = 72;
/** Story apps put their own controls in the top and bottom bands. */
const STORY_TOP = 200;
const STORY_BOTTOM = 120;
const CARD_GAP = 28;
const CARD_HEIGHT = 270;
const CARD_PAD = 40;
const SECTION_GAP = 56;
const LABEL_TRACKING = 4;

const WHITE = "#ffffff";
const MUTED = "rgba(255, 255, 255, 0.78)";
const CARD_FILL = "rgba(0, 0, 0, 0.45)";
const CHIP_STYLE = {
  success: { fill: "rgba(34, 197, 94, 0.32)", color: "#bbf7d0" },
  default: { fill: "rgba(255, 255, 255, 0.22)", color: WHITE },
} as const;
const WATERMARK = new URL(SITE_URL).host;

const font = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}`;

let segmenter: Intl.Segmenter | undefined;

/** The characters a reader sees, so a cut never splits an emoji such as
 * "🧗‍♀️" into broken pieces. Firefox before 125 has no `Intl.Segmenter`; code
 * points there still keep two-part emoji whole. */
export function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== "function") return Array.from(text);
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/** Cuts `text` to `maxWidth`, ending it with an ellipsis if anything was cut. */
export function fitText(text: string, maxWidth: number, font: string, measure: MeasureText) {
  if (measure(text, font) <= maxWidth) return text;
  const parts = graphemes(text);
  const cut = (end: number) => `${parts.slice(0, end).join("").trimEnd()}…`;
  let end = parts.length;
  while (end > 0 && measure(cut(end), font) > maxWidth) end -= 1;
  return cut(end);
}

/** Width of text drawn one character at a time with `tracking` between
 * characters, the way `drawShareImage` draws tracked text. */
export function trackedMeasure(tracking: number, measure: MeasureText): MeasureText {
  return (text, spec) => {
    // Splits like the draw loop, so both see the same characters.
    const parts = graphemes(text);
    const width = parts.reduce((total, part) => total + measure(part, spec), 0);
    return width + tracking * Math.max(0, parts.length - 1);
  };
}

/** Greedy word wrap. The last allowed line takes the rest, cut with an
 * ellipsis, and any line holding a word too wide to fit is cut too. */
export function wrapText(
  text: string,
  maxWidth: number,
  font: string,
  measure: MeasureText,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const [index, word] of words.entries()) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next, font) <= maxWidth) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      const rest = [line, ...words.slice(index)].join(" ");
      return [...lines, fitText(rest, maxWidth, font, measure)];
    }
    lines.push(fitText(line, maxWidth, font, measure));
    line = word;
  }
  if (line) lines.push(fitText(line, maxWidth, font, measure));
  return lines;
}

/** Card positions for one to four stats: 1 is full width, 2 is a row, 3 is a
 * row and a full-width card, 4 is a 2×2 grid. */
export function statCardRects(count: number, x: number, y: number, width: number) {
  const half = (width - CARD_GAP) / 2;
  const rects: { x: number; y: number; width: number; height: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / 2);
    const alone = index === count - 1 && index % 2 === 0;
    rects.push({
      x: alone || index % 2 === 0 ? x : x + half + CARD_GAP,
      y: y + row * (CARD_HEIGHT + CARD_GAP),
      width: alone ? width : half,
      height: CARD_HEIGHT,
    });
  }
  return rects;
}

function headerOps(
  content: ShareImageContent,
  top: number,
  fonts: ShareImageFonts,
  measure: MeasureText,
): { ops: ShareImageOp[]; bottom: number } {
  const ops: ShareImageOp[] = [];
  const width = SHARE_IMAGE_WIDTH - PAD * 2;
  const titleFont = font(700, 64, fonts.sans);
  const chipFont = font(500, 30, fonts.sans);
  let y = top;

  const chipWidth = content.status ? measure(content.status.label, chipFont) + 44 : 0;
  const title = fitText(
    content.title,
    width - (chipWidth ? chipWidth + 20 : 0),
    titleFont,
    measure,
  );
  ops.push({ kind: "text", text: title, x: PAD, y, font: titleFont, color: WHITE });
  if (content.status) {
    const style = CHIP_STYLE[content.status.tone];
    const chipX = PAD + measure(title, titleFont) + 20;
    ops.push(
      {
        kind: "rect",
        x: chipX,
        y: y + 8,
        width: chipWidth,
        height: 52,
        radius: 26,
        fill: style.fill,
      },
      {
        kind: "text",
        text: content.status.label,
        x: chipX + 22,
        y: y + 18,
        font: chipFont,
        color: style.color,
      },
    );
  }
  y += 80;

  const bodyFont = font(400, 38, fonts.sans);
  ops.push({ kind: "text", text: content.dates, x: PAD, y, font: bodyFont, color: MUTED });
  y += 54;

  if (content.description) {
    y += 8;
    for (const line of wrapText(content.description, width, bodyFont, measure, 2)) {
      ops.push({ kind: "text", text: line, x: PAD, y, font: bodyFont, color: WHITE });
      y += 52;
    }
  }
  return { ops, bottom: y };
}

function statsHeight(count: number) {
  const rows = Math.ceil(count / 2);
  // Heading, grid, then the watermark.
  return 64 + rows * CARD_HEIGHT + Math.max(0, rows - 1) * CARD_GAP + 32 + 28;
}

function statOps(
  stats: ShareStat[],
  top: number,
  fonts: ShareImageFonts,
  measure: MeasureText,
): ShareImageOp[] {
  const width = SHARE_IMAGE_WIDTH - PAD * 2;
  const ops: ShareImageOp[] = [
    {
      kind: "text",
      text: "At a glance",
      x: PAD,
      y: top,
      font: font(600, 44, fonts.sans),
      color: WHITE,
    },
  ];
  const labelFont = font(500, 30, fonts.sans);
  const valueFont = font(600, 88, fonts.display);
  const subFont = font(400, 30, fonts.sans);
  const rects = statCardRects(stats.length, PAD, top + 64, width);

  for (const [index, stat] of stats.entries()) {
    const rect = rects[index];
    const inner = rect.width - CARD_PAD * 2;
    const x = rect.x + CARD_PAD;
    ops.push(
      { kind: "rect", ...rect, radius: 32, fill: CARD_FILL },
      {
        kind: "text",
        text: fitText(
          stat.label.toUpperCase(),
          inner,
          labelFont,
          trackedMeasure(LABEL_TRACKING, measure),
        ),
        x,
        y: rect.y + CARD_PAD,
        font: labelFont,
        color: MUTED,
        tracking: LABEL_TRACKING,
      },
      {
        kind: "text",
        text: fitText(stat.value, inner, valueFont, measure),
        x,
        y: rect.y + CARD_PAD + 46,
        font: valueFont,
        color: WHITE,
      },
    );
    if (stat.sub)
      ops.push({
        kind: "text",
        text: fitText(stat.sub, inner, subFont, measure),
        x,
        y: rect.y + CARD_PAD + 150,
        font: subFont,
        color: MUTED,
      });
  }

  const gridBottom = rects.length ? rects[rects.length - 1].y + CARD_HEIGHT : top + 64;
  ops.push({
    kind: "text",
    text: WATERMARK,
    x: SHARE_IMAGE_WIDTH / 2,
    y: gridBottom + 32,
    font: font(600, 28, fonts.sans),
    color: MUTED,
    align: "center",
  });
  return ops;
}

/** Everything to draw, in order. Kept free of the DOM so it can be tested. */
export function layoutShareImage(
  content: ShareImageContent,
  format: ShareImageFormat,
  fonts: ShareImageFonts,
  measure: MeasureText,
): ShareImageLayout {
  const header = headerOps(content, format === "story" ? STORY_TOP : PAD, fonts, measure);
  const stats = content.stats.slice(0, MAX_SHARE_STATS);
  const blockHeight = statsHeight(stats.length);
  const height =
    format === "story" ? STORY_HEIGHT : header.bottom + SECTION_GAP + blockHeight + PAD;
  // A story pins the stats to the bottom band, unless the header runs into
  // them.
  const statsTop =
    format === "story"
      ? Math.max(header.bottom + SECTION_GAP, STORY_HEIGHT - STORY_BOTTOM - blockHeight)
      : header.bottom + SECTION_GAP;
  return {
    width: SHARE_IMAGE_WIDTH,
    height,
    ops: [...header.ops, ...statOps(stats, statsTop, fonts, measure)],
  };
}

/** "Été à Fontainebleau" saves as "ete-a-fontainebleau-story.png". */
export function shareImageFileName(title: string, format: ShareImageFormat) {
  return `${slugify(title) || "trip"}-${format}.png`;
}

/** The image's size without measuring any text, for a placeholder of the
 * right shape. A description counts as one line. */
export function estimateShareImageSize(content: ShareImageContent, format: ShareImageFormat) {
  const { width, height } = layoutShareImage(content, format, { sans: "", display: "" }, () => 0);
  return { width, height };
}

let fontsReady: Promise<ShareImageFonts> | undefined;

/** Loaded once per page; every redraw after the first reuses the result. */
function loadShareFonts(): Promise<ShareImageFonts> {
  fontsReady ??= resolveShareFonts();
  return fontsReady;
}

/** Next/font gives each family a hashed name, so read the real names from
 * the variables it sets on `<html>`. A font that fails to load falls back to
 * the next family in the stack rather than failing the draw. */
async function resolveShareFonts(): Promise<ShareImageFonts> {
  const style = getComputedStyle(document.documentElement);
  const sans = style.getPropertyValue("--font-geist-sans").trim() || "system-ui, sans-serif";
  const display = style.getPropertyValue("--font-barlow-condensed").trim() || sans;
  await Promise.all(
    [font(400, 38, sans), font(700, 64, sans), font(600, 88, display)].map((spec) =>
      document.fonts.load(spec).catch(() => []),
    ),
  );
  return { sans, display };
}

function drawShareImage(context: CanvasRenderingContext2D, layout: ShareImageLayout) {
  context.clearRect(0, 0, layout.width, layout.height);
  context.textBaseline = "top";
  for (const op of layout.ops) {
    if (op.kind === "rect") {
      context.shadowColor = "transparent";
      context.fillStyle = op.fill;
      context.beginPath();
      context.roundRect(op.x, op.y, op.width, op.height, op.radius);
      context.fill();
      continue;
    }
    // A soft shadow keeps white text readable on a bright sky.
    context.shadowColor = "rgba(0, 0, 0, 0.45)";
    context.shadowBlur = 16;
    context.shadowOffsetY = 2;
    context.font = op.font;
    context.fillStyle = op.color;
    context.textAlign = op.align ?? "left";
    if (!op.tracking) {
      context.fillText(op.text, op.x, op.y);
      continue;
    }
    let x = op.x;
    for (const char of graphemes(op.text)) {
      context.fillText(char, x, op.y);
      x += context.measureText(char).width + op.tracking;
    }
  }
}

/** Draws the image on a transparent canvas and encodes it as a PNG. */
export async function renderShareImage(
  content: ShareImageContent,
  format: ShareImageFormat,
): Promise<Blob> {
  const fonts = await loadShareFonts();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  const measure: MeasureText = (text, spec) => {
    context.font = spec;
    return context.measureText(text).width;
  };
  const layout = layoutShareImage(content, format, fonts, measure);
  canvas.width = layout.width;
  canvas.height = layout.height;
  drawShareImage(context, layout);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))),
      "image/png",
    ),
  );
}

/** Adds or removes a stat, keeping page order and the four-stat limit. */
export function toggleShareStat(
  selected: readonly AnalyticsCardId[],
  id: AnalyticsCardId,
  order: readonly AnalyticsCardId[],
): AnalyticsCardId[] {
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  if (selected.length >= MAX_SHARE_STATS) return [...selected];
  const next = new Set([...selected, id]);
  return order.filter((item) => next.has(item));
}

/** The saved choice, limited to stats on this page. Anything unreadable, or
 * a choice with none of this page's stats, falls back to the first four. */
export function readShareStats(
  saved: string | null,
  order: readonly AnalyticsCardId[],
): AnalyticsCardId[] {
  const fallback = order.slice(0, MAX_SHARE_STATS);
  if (!saved) return fallback;
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return fallback;
    const ids = new Set(parsed.filter((item): item is string => typeof item === "string"));
    const chosen = order.filter((item) => ids.has(item)).slice(0, MAX_SHARE_STATS);
    return chosen.length ? chosen : fallback;
  } catch {
    return fallback;
  }
}
