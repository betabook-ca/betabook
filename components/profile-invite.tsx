import { buttonVariants } from "@heroui/react";

import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { signInUrl, signUpUrl } from "@/lib/sign-in-redirect";
import { SITE_NAME } from "@/lib/site";

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
      className={`flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between ${cardClass("md")}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        {/* Always shown, photo or not: an inviter with no photo used to get a
         * bare heading, which read as a different card from the one every
         * other climber's link produces. Initials keep the invitation's
         * shape and are the same fallback the rest of the app uses. */}
        <UserAvatar name={name} image={image} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <PageTitle className="break-words">
            {name} invited you to {SITE_NAME}
          </PageTitle>
          <p className="text-sm text-muted">
            Sign up to send {name} a friend request, see more of their climbing, and log your own
            sends and sessions.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-3">
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
