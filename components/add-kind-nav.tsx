import { clsx } from "clsx";

import { AppLink } from "@/components/ui/app-link";

const KINDS = [
  { value: "climb", label: "Climb", href: "/climbs/new" },
  { value: "area", label: "Area", href: "/areas/new" },
] as const;

/** Header Add opens the climb form; this switches between the two create pages. */
export function AddKindNav({ current }: { current: "climb" | "area" }) {
  return (
    <nav
      aria-label="What to add"
      className="flex max-w-full shrink-0 gap-1 self-start rounded-2xl bg-surface-secondary p-1"
    >
      {KINDS.map((kind) => (
        <AppLink
          key={kind.value}
          href={kind.href}
          aria-current={kind.value === current ? "page" : undefined}
          className={clsx(
            "rounded-full px-4 py-2 text-sm no-underline hover:no-underline",
            kind.value === current
              ? "bg-segment font-semibold text-segment-foreground"
              : "text-muted hover:text-foreground",
          )}
        >
          {kind.label}
        </AppLink>
      ))}
    </nav>
  );
}
