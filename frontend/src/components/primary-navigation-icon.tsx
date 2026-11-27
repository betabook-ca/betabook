/**
 * @license ISC
 * Gear and graduation-cap geometry adapted from Lucide.
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
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
          <path d="M6 15h6a4 4 0 0 1 4 4v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1a4 4 0 0 1 4-4Zm12 .2a4 4 0 0 1 4 3.8v1a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1c0-1.4-.4-2.6-1-3.8Z" />
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
          {/* Match Lucide's rounded cap outline and attach its tassel at the same point. */}
          <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
          <path d="M6 13.5l5.17 2.36a2 2 0 0 0 1.66 0L18 13.5V16a6 3 0 0 1-12 0z" />
          <path
            d="M22 10v6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {id === "account" && (
        <path
          fillRule="evenodd"
          d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      )}
    </svg>
  );
}
