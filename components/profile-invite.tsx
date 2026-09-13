import { buttonVariants } from "@heroui/react";

import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { signInUrl, signUpUrl } from "@/lib/sign-in-redirect";
import { SITE_NAME } from "@/lib/site";

/** Signed-out view of a valid share link: name and avatar only. */
export function ProfileInvite({
  name,
  image,
  next,
}: {
  name: string;
  image: string | null;
  next: string;
}) {
  return (
    <section
      aria-label="Invitation"
      className={`mx-auto flex max-w-xl flex-col items-center gap-5 text-center ${cardClass("md")}`}
    >
      {image && <UserAvatar name={name} image={image} size="lg" />}
      <div className="flex min-w-0 flex-col gap-2">
        <PageTitle className="break-words">
          {name} invited you to {SITE_NAME}
        </PageTitle>
        <p className="text-muted">
          {SITE_NAME} is a climbing logbook and crag database. Sign up to send {name} a friend
          request, see their climbing, and log your own sends and sessions.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <AppLink href={signUpUrl(next)} className={buttonVariants()}>
          Sign up
        </AppLink>
        <AppLink href={signInUrl(next)} className={buttonVariants({ variant: "outline" })}>
          Sign in
        </AppLink>
      </div>
    </section>
  );
}
