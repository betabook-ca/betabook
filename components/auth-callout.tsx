"use client";

import { buttonVariants } from "@heroui/react";

import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { LOGBOOK_PAGE } from "@/lib/landing-pages";
import { signInUrl, signUpUrl } from "@/lib/sign-in-redirect";

export function AuthCallout({
  next,
  onNavigate,
  description = "Sign in to see sends, climber profiles and your own logbook.",
}: {
  next: string;
  onNavigate?: () => void;
  description?: string;
}) {
  return (
    <section aria-label="Member content" className={cardClass("md")}>
      <div className="flex flex-col gap-3">
        <p className="font-semibold">For Betabook members</p>
        <p className="text-sm text-muted">{description}</p>
        <div className="flex flex-wrap gap-3">
          <AppLink href={signInUrl(next)} onClick={onNavigate} className={buttonVariants()}>
            Sign in
          </AppLink>
          <AppLink
            href={signUpUrl(next)}
            onClick={onNavigate}
            className={buttonVariants({ variant: "outline" })}
          >
            Sign up
          </AppLink>
          <AppLink
            href={LOGBOOK_PAGE.path}
            onClick={onNavigate}
            className={buttonVariants({ variant: "ghost" })}
          >
            How Betabook works
          </AppLink>
        </div>
      </div>
    </section>
  );
}
