import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { SEARCH_PATH } from "@/lib/search";
import { usePathname } from "@/spa/shims/next-navigation";

export default function PlaceholderRoute() {
  const pathname = usePathname();
  return (
    <section className={`mx-auto max-w-xl ${cardClass("md", "bordered")}`}>
      <PageTitle>Route migrating in next layer</PageTitle>
      <p className="mt-2 text-sm text-muted">
        <code className="rounded bg-surface-secondary px-1.5 py-0.5">{pathname}</code> is scheduled
        to migrate from Next.js onto the Rust Worker + React Router SPA in Stack Layers 6–8
        (Profile, Journal, Sends, Feed, Friends, Trips, Goals, Lists, Account, and Admin).
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <AppLink href="/" className="font-medium">
          Home
        </AppLink>
        <AppLink href={SEARCH_PATH} className="font-medium">
          Find climbs
        </AppLink>
        <AppLink href="/areas/1" className="font-medium">
          Explore catalog
        </AppLink>
      </div>
    </section>
  );
}
