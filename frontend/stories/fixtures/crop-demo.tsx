import { useOverlayState } from "@heroui/react";
import { useEffect, useState } from "react";

import { ProfilePhotoCropper } from "@/components/profile-photo-cropper";

/** A landscape photo drawn on a canvas, so the example needs no binary
 * fixture and cropping it has a visible effect: the quadrants and the centre
 * circle make it obvious which part of the photo was framed, and which way
 * up it ended. */
export async function drawDemoPhoto(width: number, height: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");

  const quadrants = ["#1d4ed8", "#0f766e", "#b45309", "#9333ea"];
  for (const [index, fill] of quadrants.entries()) {
    context.fillStyle = fill;
    context.fillRect(
      index % 2 === 0 ? 0 : width / 2,
      index < 2 ? 0 : height / 2,
      width / 2,
      height / 2,
    );
  }

  context.fillStyle = "#f8fafc";
  context.beginPath();
  context.arc(width / 2, height / 2, Math.min(width, height) / 4, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#0f172a";
  context.font = `${Math.round(height / 10)}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("TOP", width / 2, height / 8);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not draw the demo photo");
  return new File([blob], "demo-photo.png", { type: "image/png" });
}

type CropResult = { width: number; height: number; type: string; bytes: number };

/** The cropper with a photo already chosen, plus a readout of what "Use
 * photo" produced — which is what the browser test asserts on. */
export function CropDemo({ width = 1200, height = 800 }: { width?: number; height?: number }) {
  const state = useOverlayState({ defaultOpen: true });
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CropResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const photo = await drawDemoPhoto(width, height);
      if (!cancelled) setFile(photo);
    };
    void draw();
    return () => {
      cancelled = true;
    };
  }, [width, height]);

  async function handleCropped(photo: File) {
    const bitmap = await createImageBitmap(photo);
    setResult({
      width: bitmap.width,
      height: bitmap.height,
      type: photo.type,
      bytes: photo.size,
    });
    bitmap.close();
    state.close();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="link text-sm" onClick={state.open}>
          Open the cropper
        </button>
        {result === null ? (
          <p data-testid="crop-result" className="text-sm text-muted">
            No crop yet
          </p>
        ) : (
          <p data-testid="crop-result" className="text-sm">
            {`${result.width}×${result.height} ${result.type} (${result.bytes} bytes)`}
          </p>
        )}
      </div>
      <ProfilePhotoCropper file={file} state={state} onCropped={handleCropped} isPending={false} />
    </div>
  );
}
