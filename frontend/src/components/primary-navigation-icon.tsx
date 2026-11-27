/**
 * @license ISC
 * Navigation outline geometry adapted from Lucide.
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
import { TrendingUp } from "lucide-react";

import type { PrimaryArea } from "@/lib/app-navigation";

type NavigationArea = PrimaryArea | "search" | "add" | "tutorials";
const BOOK =
  "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z";
const PIN =
  "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0";
const CAP =
  "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z";
const GEAR =
  "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915";
// Offset the front figure's 4-unit curves by both half-strokes plus the visible gap.
const COMMUNITY_INNER_RADIUS = 4 + 1.7 + 1.5;
const COMMUNITY_HEAD_INNER_X = 9 + Math.sqrt(COMMUNITY_INNER_RADIUS ** 2 - 3.872 ** 2);
const COMMUNITY_BODY_INNER_X = 12 + Math.sqrt(COMMUNITY_INNER_RADIUS ** 2 - 3.87 ** 2);
const COMMUNITY_FILLED_REAR_HEAD = `M16 3.128a4 4 0 0 1 0 7.744L${COMMUNITY_HEAD_INNER_X} 10.872A${COMMUNITY_INNER_RADIUS} ${COMMUNITY_INNER_RADIUS} 0 0 0 ${COMMUNITY_HEAD_INNER_X} 3.128Z`;
const COMMUNITY_FILLED_REAR_BODY = `M22 21v-2a4 4 0 0 0-3-3.87L${COMMUNITY_BODY_INNER_X} 15.13A${COMMUNITY_INNER_RADIUS} ${COMMUNITY_INNER_RADIUS} 0 0 1 ${12 + COMMUNITY_INNER_RADIUS} 19V21Z`;
const SEARCH_HANDLE = "m16.2 14.8 5.4 5.4a1 1 0 0 1-1.4 1.4l-5.4-5.4";

/** Selected fills retain the same painted outline, including its outer stroke. */
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
  if (area === "progress")
    return <TrendingUp aria-hidden className="size-5 shrink-0" strokeWidth={active ? 2.8 : 2} />;
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={area === "search" ? 1.25 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {active && <FilledShapes area={area} />}
      <g fill="none">
        {area === "logbook" && (
          <>
            <path d={BOOK} />
            {!active && <path d="M12 5v16" />}
          </>
        )}
        {area === "community" && (
          <g fill={active ? "currentColor" : "none"}>
            {/* Keep the original outlines; selection only closes and fills them. */}
            <path
              d={
                active
                  ? "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2Z"
                  : "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
              }
            />
            <path d={active ? COMMUNITY_FILLED_REAR_HEAD : "M16 3.128a4 4 0 0 1 0 7.744"} />
            <path d={active ? COMMUNITY_FILLED_REAR_BODY : "M22 21v-2a4 4 0 0 0-3-3.87"} />
            <circle cx="9" cy="7" r="4" />
          </g>
        )}
        {area === "search" && (
          <>
            <circle cx="10" cy="10" r="7.5" />
            <circle cx="10" cy="10" r="5" />
            <path d={SEARCH_HANDLE} />
          </>
        )}
        {area === "add" && (
          <>
            <path d={PIN} />
            <circle cx="12" cy="10" r={active ? 3.5 : 3} />
          </>
        )}
        {area === "tutorials" && (
          <>
            <path d={CAP} />
            <path d="M22 10v6" />
            <path
              d={active ? "M6 14.6V16a6 3 0 0 0 12 0v-1.4" : "M6 12.5V16a6 3 0 0 0 12 0v-3.5"}
            />
          </>
        )}
        {area === "account" && (
          <>
            <path d={GEAR} />
            <circle cx="12" cy="12" r={active ? 3.5 : 3} />
          </>
        )}
      </g>
    </svg>
  );
}

function FilledShapes({ area }: { area: NavigationArea }) {
  return (
    <g stroke="none">
      {area === "logbook" && (
        <path d="M4 3h4c1.2 0 2.35.4 3.25 1.2v16c-.9-.8-2.05-1.2-3.25-1.2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm16 0h-4c-1.2 0-2.35.4-3.25 1.2v16c.9-.8 2.05-1.2 3.25-1.2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" />
      )}
      {area === "search" && (
        <>
          <path
            fillRule="evenodd"
            d="M17.5 10a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0ZM15 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z"
          />
          <path d={`${SEARCH_HANDLE}Z`} />
        </>
      )}
      {area === "add" && (
        <path fillRule="evenodd" d={`${PIN}Z M15.5 10a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z`} />
      )}
      {area === "tutorials" && (
        <>
          <path d={CAP} />
          <path d="M6 14.6l5.17 2.36a2 2 0 0 0 1.66 0L18 14.6V16a6 3 0 0 1-12 0z" />
        </>
      )}
      {area === "account" && (
        <path fillRule="evenodd" d={`${GEAR}Z M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z`} />
      )}
    </g>
  );
}
