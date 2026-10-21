"use client";

import { Button, Checkbox, useOverlayState } from "@heroui/react";
import { clsx } from "clsx";
import { Copy, Download, ImageDown, Share2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import { openShareSheet, useNativeShare } from "@/hooks/use-native-share";
import type { AnalyticsCardId } from "@/lib/analytics-layout";
import { downloadBlob } from "@/lib/download";
import {
  estimateShareImageSize,
  MAX_SHARE_STATS,
  readShareStats,
  renderShareImage,
  shareImageFileName,
  toggleShareStat,
  type ShareImageContent,
  type ShareImageFormat,
  type ShareStat,
} from "@/lib/share-image";

/** Shared across trips, so a climber who always shares the same stats picks
 * them once. */
export const SHARE_STATS_STORAGE_KEY = "betabook:share-image-stats";
export const SHARE_DESCRIPTION_STORAGE_KEY = "betabook:share-image-description";

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

/** Off unless chosen: some descriptions run long enough to crowd the image. */
function readWithDescription() {
  try {
    return localStorage.getItem(SHARE_DESCRIPTION_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Optional preference. */
  }
}

type DrawOptions = {
  format: ShareImageFormat;
  ids: readonly AnalyticsCardId[];
  description: boolean;
};

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
  const [withDescription, setWithDescription] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [abilities, setAbilities] = useState({ copy: false, share: false });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawFailed, setDrawFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const statsLabelId = useId();

  // Only the latest draw may set the preview; an earlier one can finish
  // after it.
  const drawRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  // A full-size PNG stays in memory until its URL is revoked.
  useEffect(() => {
    const draws = drawRef;
    const urls = urlRef;
    return () => {
      draws.current += 1;
      if (urls.current) URL.revokeObjectURL(urls.current);
    };
  }, []);

  function imageContent(options: DrawOptions): ShareImageContent {
    return {
      ...content,
      description: options.description ? content.description : null,
      stats: stats.filter((stat) => options.ids.includes(stat.id)),
    };
  }

  function replacePreview(next: Preview | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next?.url ?? null;
    setPreview(next);
  }

  /** Drops the preview once the dialog has slid away, and ignores any draw
   * still running. */
  function release() {
    // A quick reopen runs the last close's reset after the new draw starts;
    // that draw must survive.
    if (state.isOpen) return;
    drawRef.current += 1;
    replacePreview(null);
    setPending(false);
  }

  /** The last preview stays up, dimmed, until the next one is ready, so the
   * dialog doesn't flash a placeholder on every toggle. The actions wait for
   * the new image, so what gets shared always matches the controls. */
  async function draw(options: DrawOptions) {
    const id = (drawRef.current += 1);
    setNotice(null);
    setError(null);
    setDrawFailed(false);
    if (options.ids.length === 0) {
      replacePreview(null);
      setPending(false);
      return;
    }
    setPending(true);
    try {
      const blob = await render(imageContent(options), options.format);
      if (id !== drawRef.current) return;
      replacePreview({ blob, url: URL.createObjectURL(blob) });
      setPending(false);
    } catch {
      if (id !== drawRef.current) return;
      // An older image would pass for the current choice.
      replacePreview(null);
      setDrawFailed(true);
      setPending(false);
    }
  }

  const current: DrawOptions = { format, ids: selected, description: withDescription };

  function open() {
    const ids = readSaved(order);
    const description = readWithDescription();
    setSelected(ids);
    setWithDescription(description);
    setAbilities({ copy: canCopyImage(), share: nativeShare && canShareFiles() });
    state.open();
    void draw({ format, ids, description });
  }

  function toggle(id: AnalyticsCardId) {
    const ids = toggleShareStat(selected, id, order);
    setSelected(ids);
    savePreference(SHARE_STATS_STORAGE_KEY, JSON.stringify(ids));
    void draw({ ...current, ids });
  }

  function toggleDescription(description: boolean) {
    setWithDescription(description);
    savePreference(SHARE_DESCRIPTION_STORAGE_KEY, String(description));
    void draw({ ...current, description });
  }

  function retry() {
    void draw(current);
  }

  function changeFormat(next: ShareImageFormat) {
    setFormat(next);
    void draw({ ...current, format: next });
  }

  async function share(blob: Blob) {
    setError(null);
    try {
      await openShareSheet({
        files: [new File([blob], shareImageFileName(content.title, format), { type: "image/png" })],
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

  const blob = pending ? undefined : preview?.blob;
  const atLimit = selected.length >= MAX_SHARE_STATS;
  const placeholder = estimateShareImageSize(imageContent(current), format);

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
        onClose={release}
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
              onPress={() => blob && downloadBlob(blob, shareImageFileName(content.title, format))}
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
          <div
            className="flex justify-center rounded-xl bg-surface-secondary p-3"
            aria-busy={pending}
          >
            {selected.length === 0 ? (
              <p className="py-16 text-sm text-muted">Choose at least one stat.</p>
            ) : preview ? (
              // An object URL, which next/image can't optimize.
              // oxlint-disable-next-line nextjs/no-img-element
              <img
                src={preview.url}
                alt="Preview: trip header and selected stats"
                className={clsx(
                  "rounded-md transition-opacity",
                  format === "story" ? "h-[36vh] w-auto" : "h-auto w-full",
                  pending && "opacity-60",
                )}
                style={CHECKERBOARD_STYLE}
              />
            ) : drawFailed ? (
              <div role="alert" className="flex flex-col items-center gap-3 py-16">
                <p className="text-sm text-danger">Couldn't draw the image.</p>
                <Button size="sm" variant="outline" onPress={retry}>
                  Try again
                </Button>
              </div>
            ) : (
              // Shaped like the image it stands in for, so the stat list
              // below doesn't move when the preview arrives.
              <div
                className={format === "story" ? "h-[36vh]" : "w-full"}
                style={{ aspectRatio: `${placeholder.width} / ${placeholder.height}` }}
              >
                <Skeleton className="size-full" tone="raised" />
              </div>
            )}
          </div>

          {/* A labelled group, not a fieldset: a legend must be the
           * fieldset's first child, which would put the count on its own row. */}
          <div role="group" aria-labelledby={statsLabelId} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span id={statsLabelId} className={EYEBROW_CLASS}>
                Stats
              </span>
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
          </div>

          {content.description && (
            <Checkbox isSelected={withDescription} onChange={toggleDescription}>
              <Checkbox.Content className="flex items-center gap-2">
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="text-sm">Include description</span>
              </Checkbox.Content>
            </Checkbox>
          )}

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
