import type { CSSProperties, ImgHTMLAttributes } from "react";

export type StaticImageData = {
  src: string;
  width?: number;
  height?: number;
  blurDataURL?: string;
};

export type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
  src: string | StaticImageData;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  unoptimized?: boolean;
  priority?: boolean;
  quality?: number | string;
  loader?: unknown;
  placeholder?: string;
  blurDataURL?: string;
};

/** Direct `<img>` compatibility shim for `next/image`. */
export default function Image({
  src,
  alt,
  width,
  height,
  fill,
  unoptimized: _unoptimized,
  priority,
  quality: _quality,
  loader: _loader,
  placeholder: _placeholder,
  blurDataURL: _blurDataURL,
  style,
  loading,
  ...rest
}: ImageProps) {
  const resolvedSrc = typeof src === "string" ? src : src.src;
  const resolvedWidth = fill
    ? undefined
    : (width ?? (typeof src === "object" ? src.width : undefined));
  const resolvedHeight = fill
    ? undefined
    : (height ?? (typeof src === "object" ? src.height : undefined));

  const fillStyle: CSSProperties | undefined = fill
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        ...style,
      }
    : style;

  return (
    // oxlint-disable-next-line next/no-img-element -- direct <img> is the purpose of this SPA next/image shim
    <img
      src={resolvedSrc}
      alt={alt}
      width={resolvedWidth}
      height={resolvedHeight}
      loading={loading ?? (priority ? "eager" : undefined)}
      style={fillStyle}
      {...rest}
    />
  );
}
