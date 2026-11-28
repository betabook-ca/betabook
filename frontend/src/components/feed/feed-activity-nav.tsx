import { SectionNavigation } from "@/components/ui/section-navigation";
import type { FeedView } from "@/lib/feed";

/** All activity / Sends, shared by the feed and its loading state so the
 * pills hold still while the next view loads. */
export function FeedActivityNav({ view }: { view: FeedView }) {
  return (
    <SectionNavigation
      appearance="pills"
      label="Feed activity"
      tabs={(["all", "sends"] as const).map((value) => ({
        label: value === "all" ? "All activity" : "Sends",
        href: `/feed?view=${value}`,
        current: value === view,
      }))}
    />
  );
}
