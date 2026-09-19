"use client";

import { clsx } from "clsx";
import Image from "next/image";
import { useState } from "react";

import { getAvatarPhoto, getUserInitials } from "@/lib/user-initials";

const AVATAR_SIZE = {
  xs: { pixels: 24, className: "size-6 text-[0.625rem]" },
  sm: { pixels: 32, className: "size-8 text-xs" },
  md: { pixels: 48, className: "size-12 text-sm" },
  lg: { pixels: 64, className: "size-16 text-xl" },
} as const;

type UserAvatarProps = {
  name: string;
  image?: string | null;
  size?: keyof typeof AVATAR_SIZE;
  className?: string;
};

/** The climber's photo — one they uploaded, or the OAuth photo stored by
 * Better Auth — with an inline initials treatment for accounts with neither
 * and for an image that fails to load. Decorative: its surrounding account
 * UI already provides the label.
 *
 * An uploaded photo is served at the size avatars need, so it renders as a
 * plain <img>; only the Google URL goes through next/image. */
export function UserAvatar({ name, image, size = "md", className }: UserAvatarProps) {
  const { pixels, className: sizeClassName } = AVATAR_SIZE[size];
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const photo = getAvatarPhoto(image);
  const imageUrl = photo?.url ?? null;

  return (
    <div
      aria-hidden="true"
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-separator bg-accent font-display font-semibold tracking-wide text-accent-foreground",
        sizeClassName,
        className,
      )}
    >
      {photo === null || imageUrl === failedImage ? (
        getUserInitials(name)
      ) : (
        <Image
          src={photo.url}
          alt=""
          width={pixels}
          height={pixels}
          // An uploaded photo is already 256 px of WebP, so optimizing it
          // would spend Worker CPU to hand back the same bytes.
          unoptimized={!photo.optimize}
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(photo.url)}
        />
      )}
    </div>
  );
}
