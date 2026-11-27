import { BookOpen, TrendingUp, Users, MapPin, GraduationCap, Settings } from "lucide-react";

import type { PrimaryArea } from "@/lib/app-navigation";

type NavigationArea = PrimaryArea | "search" | "add" | "tutorials";
const outlines = {
  logbook: BookOpen,
  progress: TrendingUp,
  community: Users,
  add: MapPin,
  tutorials: GraduationCap,
  account: Settings,
};

/** Navigation keeps one silhouette per destination, with a distinct selected state. */
export function PrimaryNavigationIcon({
  area,
  active = false,
}: {
  area: NavigationArea;
  active?: boolean;
}) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center">
      <NavigationGlyph area={area} active={active} />
    </span>
  );
}

function NavigationGlyph({ area, active }: { area: NavigationArea; active: boolean }) {
  if (active) return <FilledIcon id={area} />;
  if (area === "search")
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      >
        <circle cx="10" cy="10" r="7.5" />
        <circle cx="10" cy="10" r="5" />
        <path d="m16.2 14.8 5.4 5.4a1 1 0 0 1-1.4 1.4l-5.4-5.4" />
      </svg>
    );
  const Outline = outlines[area];
  return <Outline aria-hidden className="size-5 shrink-0" />;
}

function FilledIcon({ id }: { id: NavigationArea }) {
  if (id === "progress") {
    return <TrendingUp aria-hidden className="size-5 shrink-0" strokeWidth={2.8} />;
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="currentColor">
      {id === "logbook" && (
        <path d="M2 3.5C5.8 2.5 8.5 3 11 4.5V21c-2.7-1.7-5.5-2-9-1V3.5Zm20 0c-3.8-1-6.5-.5-9 1V21c2.7-1.7 5.5-2 9-1V3.5Z" />
      )}
      {id === "community" && (
        <>
          <circle cx="9" cy="7" r="4" />
          <path d="M2 21v-3a7 7 0 0 1 14 0v3H2Zm15-7.9a6 6 0 0 1 6 6V21h-5v-3a8.9 8.9 0 0 0-1-4.1Z" />
          <path d="M15 4a3.5 3.5 0 1 1 0 6 6 6 0 0 0 0-6Z" />
        </>
      )}
      {id === "search" && (
        <path
          fillRule="evenodd"
          d="M10 2a8 8 0 1 0 4.5 14.6l5.9 5.9 2.1-2.1-5.9-5.9A8 8 0 0 0 10 2Zm0 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
        />
      )}
      {id === "add" && (
        <path
          fillRule="evenodd"
          d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8Zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
        />
      )}
      {id === "tutorials" && (
        <>
          <path d="m12 2 12 6-12 6L0 8l12-6Zm-7 11 7 3.5 7-3.5v5c-4.7 3-9.3 3-14 0v-5Z" />
          <path d="M22 9h2v10h-2z" />
        </>
      )}
      {id === "account" && (
        <path
          fillRule="evenodd"
          d="m9 2-.6 2.5-1.3.8-2.5-.7-3 5.2 1.9 1.8v1.5l-1.9 1.8 3 5.2 2.5-.7 1.3.8L9 23h6l.6-2.6 1.3-.8 2.5.7 3-5.2-1.9-1.8v-1.5l1.9-1.8-3-5.2-2.5.7-1.3-.8L15 2H9Zm3 6.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
        />
      )}
    </svg>
  );
}
