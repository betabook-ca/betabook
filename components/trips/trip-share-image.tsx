"use client";

import { Button, Checkbox, useOverlayState } from "@heroui/react";
import { clsx } from "clsx";
import { Copy, Download, ImageDown, Share2 } from "lucide-react";
import { useRef, useState } from "react";

import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import { openShareSheet, useNativeShare } from "@/hooks/use-native-share";
import type { AnalyticsCardId } from "@/lib/analytics-layout";
import { downloadBlob } from "@/lib/download";
import {
  MAX_SHARE_STATS,
  readShareStats,
  renderShareImage,
  toggleShareStat,
  type ShareImageContent,
  type ShareImageFormat,
  type ShareStat,
} from "@/lib/share-image";

/** Shared across trips, so a climber who always shares the same stats picks
 * them once. */
export const SHARE_STATS_STORAGE_KEY = "betabook:share-image-stats";

const FORMAT_OPTIONS = [
  { value: "story", label: "Story", hint: "9:16" },
  { value: "sticker", label: "Sticker" },
] as const satisfies readonly { value: ShareImageFormat; label: string; hint?: string }[];

/** A transparent PNG shows through to the page, so the preview sits on the
 * usual checkerboard. Two greys read on both themes. */
const CHECKERBOARD_STYLE = {
  backgroundImage: "repeating-conic-gradient(#9ca3af 0% 25%, #6b7280 0% 50%)",
  backgroundSize: "24px 24px",
};

type Preview = { blob: Blob; url: string };

function fileName(title: string, format: ShareImageFormat) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "trip"}-${format}.png`;
}

function canCopyImage() {
  return typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";
}

function canShareFiles() {
  if (typeof navigator.canShare !== "function") return false;
  const probe = new File([new Uint8Array()], "probe.png", { type: "image/png" });
  return navigator.canShare({ files: [probe] });
}

function readSaved(order: readonly AnalyticsCardId[]) {
  try {
    return readShareStats(localStorage.getItem(SHARE_STATS_STORAGE_KEY), order);
  } catch {
    return readShareStats(null, order);
  }
}

/** Button and dialog that turn the trip's header and up to four stats into a
 * transparent PNG to lay over a photo. Drawn in the browser, so nothing is
 * uploaded. */
export function TripShareImage({
  content,
  stats,
  render = renderShareImage,
}: {
  content: Omit<ShareImageContent, "stats">;
  /** Every stat on the page, in page order. */
  stats: ShareStat[];
  /** For stories and tests. jsdom has no canvas. */
  render?: (content: ShareImageContent, format: ShareImageFormat) => Promise<Blob>;
}) {
  const state = useOverlayState();
  const nativeShare = useNativeShare();
  const order = stats.map((stat) => stat.id);
  const [format, setFormat] = useState<ShareImageFormat>("story");
  const [selected, setSelected] = useState<AnalyticsCardId[]>(() =>
    order.slice(0, MAX_SHARE_STATS),
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [abilities, setAbilities] = useState({ copy: false, share: false });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only the latest draw may set the preview; an earlier one can finish
  // after it.
  const drawRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  const chosen = stats.filter((stat) => selected.includes(stat.id));

  function replacePreview(next: Preview | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next?.url ?? null;
    setPreview(next);
  }

  async function draw(nextFormat: ShareImageFormat, ids: readonly AnalyticsCardId[]) {
    const id = (drawRef.current += 1);
    replacePreview(null);
    setNotice(null);
    setError(null);
    if (ids.length === 0) return;
    try {
      const blob = await render(
        { ...content, stats: stats.filter((stat) => ids.includes(stat.id)) },
        nextFormat,
      );
      if (id === drawRef.current) replacePreview({ blob, url: URL.createObjectURL(blob) });
    } catch {
      if (id === drawRef.current) setError("Couldn't draw the image. Try again.");
    }
  }

  function open() {
    const saved = readSaved(order);
    setSelected(saved);
    setAbilities({ copy: canCopyImage(), share: nativeShare && canShareFiles() });
    state.open();
    void draw(format, saved);
  }

  function toggle(id: AnalyticsCardId) {
    const next = toggleShareStat(selected, id, order);
    setSelected(next);
    try {
      localStorage.setItem(SHARE_STATS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Optional preference. */
    }
    void draw(format, next);
  }

  function changeFormat(next: ShareImageFormat) {
    setFormat(next);
    void draw(next, selected);
  }

  async function share(blob: Blob) {
    setError(null);
    try {
      await openShareSheet({
        files: [new File([blob], fileName(content.title, format), { type: "image/png" })],
        title: content.title,
      });
    } catch {
      setError("Couldn't open the share sheet. Try Download instead.");
    }
  }

  async function copy(blob: Blob) {
    setError(null);
    try {
      // Safari only allows the write while the tap is still being handled,
      // so the blob must already exist.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setNotice("Copied. Paste it into a story or over a photo.");
    } catch {
      setError("Couldn't copy the image. Try Download instead.");
    }
  }

  const blob = chosen.length ? preview?.blob : undefined;
  const atLimit = selected.length >= MAX_SHARE_STATS;

  return (
    <>
      <Button variant="ghost" size="sm" onPress={open}>
        <ImageDown aria-hidden="true" className="size-4" />
        Share image
      </Button>

      <ResponsiveDialog
        state={state}
        title="Share as image"
        size="md"
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            {abilities.share && (
              <Button variant="primary" isDisabled={!blob} onPress={() => blob && share(blob)}>
                <Share2 aria-hidden="true" className="size-4" />
                Share
              </Button>
            )}
            {abilities.copy && (
              <Button
                variant={abilities.share ? "outline" : "primary"}
                isDisabled={!blob}
                onPress={() => blob && copy(blob)}
              >
                <Copy aria-hidden="true" className="size-4" />
                Copy
              </Button>
            )}
            <Button
              variant="outline"
              isDisabled={!blob}
              onPress={() => blob && downloadBlob(blob, fileName(content.title, format))}
            >
              <Download aria-hidden="true" className="size-4" />
              Download
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <SegmentedButtons
            value={format}
            onChange={changeFormat}
            options={FORMAT_OPTIONS}
            ariaLabel="Image size"
          />

          {/* The checkerboard is on the image, so it shows the PNG's edges.
           * A fixed story height keeps the stat list from jumping on redraw. */}
          <div className="flex justify-center rounded-xl bg-surface-secondary p-3">
            {chosen.length === 0 ? (
              <p className="py-16 text-sm text-muted">Choose at least one stat.</p>
            ) : preview ? (
              // An object URL, which next/image can't optimize.
              // oxlint-disable-next-line nextjs/no-img-element
              <img
                src={preview.url}
                alt="Preview: trip header and selected stats"
                className={clsx(
                  "rounded-md",
                  format === "story" ? "h-[36vh] w-auto" : "h-auto w-full",
                )}
                style={CHECKERBOARD_STYLE}
              />
            ) : (
              <Skeleton
                className={format === "story" ? "aspect-[9/16] h-[36vh]" : "aspect-[4/3] w-full"}
                tone="raised"
              />
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <legend className={EYEBROW_CLASS}>Stats</legend>
              <span className="text-xs text-muted" aria-live="polite">
                {selected.length} of {MAX_SHARE_STATS} selected
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {stats.map((stat) => {
                const isSelected = selected.includes(stat.id);
                return (
                  <Checkbox
                    key={stat.id}
                    isSelected={isSelected}
                    isDisabled={!isSelected && atLimit}
                    onChange={() => toggle(stat.id)}
                  >
                    <Checkbox.Content className="flex items-center gap-2">
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <span className="text-sm">{stat.label}</span>
                    </Checkbox.Content>
                  </Checkbox>
                );
              })}
            </div>
          </fieldset>

          {notice && (
            <p role="status" className="text-sm text-muted">
              {notice}
            </p>
          )}
          {error && <InlineAlert status="danger">{error}</InlineAlert>}
        </div>
      </ResponsiveDialog>
    </>
  );
}
