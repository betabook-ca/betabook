"use client";

import { clsx } from "clsx";
import Image from "next/image";
import { useState } from "react";

import { getGoogleProfileImageUrl, getUserInitials } from "@/lib/user-initials";

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

/** A user's OAuth photo when one was stored by Better Auth, with an inline
 * initials treatment for email/password accounts or an image that fails to
 * load. Decorative: its surrounding account UI already provides the label. */
export function UserAvatar({ name, image, size = "md", className }: UserAvatarProps) {
  const { pixels, className: sizeClassName } = AVATAR_SIZE[size];
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageUrl = getGoogleProfileImageUrl(image);

  return (
    <div
      aria-hidden="true"
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-separator bg-accent font-display font-semibold tracking-wide text-accent-foreground",
        sizeClassName,
        className,
      )}
    >
      {imageUrl != null && imageUrl !== failedImage ? (
        <Image
          src={imageUrl}
          alt=""
          width={pixels}
          height={pixels}
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(imageUrl)}
        />
      ) : (
        getUserInitials(name)
      )}
    </div>
  );
}
