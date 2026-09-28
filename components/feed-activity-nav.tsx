import { AppLink } from "@/components/ui/app-link";
import { choicePillClass } from "@/components/ui/choice-pill";
import type { FeedView } from "@/lib/feed";

/** All activity / Sends, shared by the feed and its loading state so the
 * pills hold still while the next view loads. */
export function FeedActivityNav({ view }: { view: FeedView }) {
  return (
    <nav aria-label="Feed activity" className="flex gap-2">
      {(["all", "sends"] as const).map((value) => (
        <AppLink
          key={value}
          href={`/feed?view=${value}`}
          className={choicePillClass(value === view, "bg-foreground text-background")}
          aria-current={value === view ? "page" : undefined}
        >
          {value === "all" ? "All activity" : "Sends"}
        </AppLink>
      ))}
    </nav>
  );
}
