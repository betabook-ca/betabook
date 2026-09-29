import { buttonVariants } from "@heroui/styles";

import { AppLink } from "@/components/ui/app-link";
import { signInUrl, signUpUrl } from "@/lib/sign-in-redirect";

/** What the signed-out holder of a profile link reads under the climber's
 * name, where a member has the friendship control. */
export function ProfileInvite({
  name,
  next,
}: {
  name: string;
  /** The page the link opened, for either path to return to. */
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
