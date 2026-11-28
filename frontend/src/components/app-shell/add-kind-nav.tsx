import { AppLink } from "@/components/ui/app-link";
import { SEGMENT_TRACK_CLASS, segmentPillClass } from "@/components/ui/segment-pills";

const KINDS = [
  { value: "climb", label: "Climb", href: "/climbs/new" },
  { value: "area", label: "Area", href: "/areas/new" },
] as const;

/** Header Add opens the climb form; this switches between the two create pages. */
export function AddKindNav({ current }: { current: "climb" | "area" }) {
  return (
    <nav aria-label="What to add" className={SEGMENT_TRACK_CLASS}>
      {KINDS.map((kind) => (
        <AppLink
          key={kind.value}
          href={kind.href}
          aria-current={kind.value === current ? "page" : undefined}
          className={segmentPillClass(kind.value === current)}
        >
          {kind.label}
        </AppLink>
      ))}
    </nav>
  );
}
