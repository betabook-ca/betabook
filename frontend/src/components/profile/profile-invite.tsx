import { buttonVariants } from "@heroui/styles";

import { AppLink } from "@/components/ui/app-link";
import { signInUrl, signUpUrl } from "@/lib/sign-in-redirect";

/** Sign-up invite shown under the user's name to signed-out visitors with a
 * share link, where signed-in users see the friend button. */
export function ProfileInvite({
  name,
  next,
}: {
  name: string;
  /** Where to return after sign-up or sign-in. */
  next: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted">
        Sign up to send {name} a friend request, see more of their climbing, and log your own sends
        and sessions.
      </p>
      <div className="flex flex-wrap gap-2">
        <AppLink href={signUpUrl(next)} className={buttonVariants({ size: "sm" })}>
          Sign up
        </AppLink>
        <AppLink
          href={signInUrl(next)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Sign in
        </AppLink>
      </div>
    </div>
  );
}
