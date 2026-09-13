import { clsx } from "clsx";
import Image from "next/image";

import { AppLink } from "@/components/ui/app-link";
import { SITE_LOCKUP_ALT, SITE_NAME } from "@/lib/site";

/** Approved generated artwork; CSS follows the resolved app theme without hydration. */
export function Brand({
  variant = "icon",
  className,
  decorative = false,
}: {
  variant?: "icon" | "wordmark" | "lockup";
  className?: string;
  decorative?: boolean;
}) {
  const [width, height] =
    variant === "lockup" ? [500, 320] : variant === "wordmark" ? [320, 80] : [48, 48];
  return (
    <span
      data-brand={variant}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : variant === "lockup" ? SITE_LOCKUP_ALT : SITE_NAME}
      aria-hidden={decorative || undefined}
      className={clsx("block shrink-0", className)}
    >
      {(["light", "dark"] as const).map((theme) => (
        <Image
          key={theme}
          src={`/branding/betabook-${variant}-${theme}.svg`}
          alt=""
          width={width}
          height={height}
          unoptimized
          className={clsx(
            "h-auto w-full",
            theme === "light" ? "block dark:hidden" : "hidden dark:block",
          )}
        />
      ))}
    </span>
  );
}

export function BrandHomeLink() {
  return (
    <AppLink
      href="/"
      aria-label="Betabook home"
      className="flex h-12 shrink-0 items-center gap-2 no-underline"
    >
      <Brand decorative className="size-12" />
      <Brand variant="wordmark" decorative className="hidden w-28 sm:block" />
    </AppLink>
  );
}
