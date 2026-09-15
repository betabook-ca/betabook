import { clsx } from "clsx";
import Image from "next/image";

import smallDarkIcon from "@/assets/branding/betabook-icon-small-dark.svg";
import smallLightIcon from "@/assets/branding/betabook-icon-small-light.svg";
import { AppLink } from "@/components/ui/app-link";
import { SITE_LOCKUP_ALT, SITE_NAME } from "@/lib/site";

/** Approved generated artwork; CSS follows the resolved app theme without hydration. */
export function Brand({
  variant = "icon",
  className,
  decorative = false,
  compact = false,
}: {
  variant?: "icon" | "wordmark" | "lockup";
  className?: string;
  decorative?: boolean;
  compact?: boolean;
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
          src={
            variant === "icon" && compact
              ? theme === "light"
                ? smallLightIcon
                : smallDarkIcon
              : `/branding/betabook-${variant}-${theme}.svg`
          }
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
      className="flex h-10 shrink-0 items-center gap-2 no-underline"
    >
      <Brand decorative compact className="size-6" />
      <Brand variant="wordmark" decorative className="w-24" />
    </AppLink>
  );
}
