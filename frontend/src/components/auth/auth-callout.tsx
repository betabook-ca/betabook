import { AppLink } from "@/components/ui/app-link";
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
    <section aria-label="Member content" className="border-l-2 border-separator px-4 py-1">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">For Betabook members</p>
        <p className="text-sm text-muted">{description}</p>
        <div className="flex flex-wrap items-center gap-x-4">
          <AppLink
            href={signInUrl(next)}
            onClick={onNavigate}
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            Sign in
          </AppLink>
          <AppLink
            href={signUpUrl(next)}
            onClick={onNavigate}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Sign up
          </AppLink>
          <AppLink
            href={LOGBOOK_PAGE.path}
            onClick={onNavigate}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            How Betabook works
          </AppLink>
        </div>
      </div>
    </section>
  );
}
