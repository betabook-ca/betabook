"use client";

import { Button, useOverlayState } from "@heroui/react";
import { clsx } from "clsx";
import { Copy, Download, ImageDown, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import { openShareSheet, useNativeShare } from "@/hooks/use-native-share";
import { downloadBlob } from "@/lib/download";
import {
  renderShareImage,
  shareImageFileName,
  type ShareImageContent,
  type ShareImageStat,
  type ShareImageFormat,
} from "@/lib/share-image";

/** A deep brand green, so white text reads without a photo underneath. */
const CARD_BACKGROUND = "#1d3326";

const FORMAT_OPTIONS = [
  { value: "story", label: "Story", hint: "9:16" },
  { value: "sticker", label: "Sticker" },
] as const satisfies readonly { value: ShareImageFormat; label: string; hint?: string }[];

type Preview = { blob: Blob; url: string };

function canShareFiles() {
  if (typeof navigator.canShare !== "function") return false;
  const probe = new File([new Uint8Array()], "probe.png", { type: "image/png" });
  return navigator.canShare({ files: [probe] });
}

function canCopyImage() {
  return typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";
}

/** One chapter as a phone-sized image, drawn in the browser so nothing is
 * uploaded. Shares through the native sheet on phones, otherwise copies or
 * downloads. */
export function ChapterShareImage({
  content,
  fileName,
  render = renderShareImage,
}: {
  content: ShareImageContent<ShareImageStat>;
  /** Names the downloaded file. */
  fileName: string;
  /** For stories and tests. jsdom has no canvas. */
  render?: typeof renderShareImage;
}) {
  const state = useOverlayState();
  const nativeShare = useNativeShare();
  const [format, setFormat] = useState<ShareImageFormat>("story");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [abilities, setAbilities] = useState({ copy: false, share: false });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const drawRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const draws = drawRef;
    const urls = urlRef;
    return () => {
      draws.current += 1;
      if (urls.current) URL.revokeObjectURL(urls.current);
    };
  }, []);

  function replacePreview(next: Preview | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next?.url ?? null;
    setPreview(next);
  }

  async function draw(next: ShareImageFormat) {
    const id = (drawRef.current += 1);
    setNotice(null);
    setError(null);
    setPending(true);
    try {
      const blob = await render(content, next, { background: CARD_BACKGROUND });
      if (id !== drawRef.current) return;
      replacePreview({ blob, url: URL.createObjectURL(blob) });
    } catch {
      if (id !== drawRef.current) return;
      replacePreview(null);
      setError("Couldn't draw the image.");
    } finally {
      if (id === drawRef.current) setPending(false);
    }
  }

  function open() {
    setAbilities({ copy: canCopyImage(), share: nativeShare && canShareFiles() });
    state.open();
    void draw(format);
  }

  function release() {
    if (state.isOpen) return;
    drawRef.current += 1;
    replacePreview(null);
    setPending(false);
  }

  const name = shareImageFileName(fileName, format);
  const blob = pending ? undefined : preview?.blob;

  async function share(image: Blob) {
    setError(null);
    try {
      await openShareSheet({
        files: [new File([image], name, { type: "image/png" })],
        title: content.title,
      });
    } catch {
      setError("Couldn't open the share sheet. Try Download instead.");
    }
  }

  async function copy(image: Blob) {
    setError(null);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
      setNotice("Copied. Paste it into a story.");
    } catch {
      setError("Couldn't copy the image. Try Download instead.");
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onPress={open} aria-label={`Share image: ${content.title}`}>
        <ImageDown aria-hidden="true" className="size-4" />
        <span className="max-sm:hidden">Share image</span>
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
              onPress={() => blob && downloadBlob(blob, name)}
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
            onChange={(next) => {
              setFormat(next);
              void draw(next);
            }}
            options={FORMAT_OPTIONS}
            ariaLabel="Image size"
          />
          <div
            className="flex justify-center rounded-xl bg-surface-secondary p-3"
            aria-busy={pending}
          >
            {preview ? (
              // An object URL, which next/image can't optimize.
              // oxlint-disable-next-line nextjs/no-img-element
              <img
                src={preview.url}
                alt={`Preview: ${content.title}`}
                className={clsx(
                  "rounded-md transition-opacity",
                  format === "story" ? "h-[46vh] w-auto" : "h-auto w-full",
                  pending && "opacity-60",
                )}
              />
            ) : (
              <div
                className={format === "story" ? "aspect-[9/16] h-[46vh]" : "aspect-square w-full"}
              >
                <Skeleton className="size-full" tone="raised" />
              </div>
            )}
          </div>
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
