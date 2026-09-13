"use client";

import { NavLink } from "@/components/nav-link";

/** The same destinations in the desktop header and original mobile menu. */
export function PrimaryPageLinks({
  userId,
  direction = "row",
  onNavigate,
}: {
  userId: string;
  direction?: "row" | "col";
  onNavigate?: () => void;
}) {
  const layout = direction === "col" ? "menu" : "header";
  return (
    <>
      <NavLink appearance="primary" layout={layout} href="/climbs/new" onClick={onNavigate}>
        Add climb
      </NavLink>
      <NavLink appearance="primary" layout={layout} href="/areas/new" onClick={onNavigate}>
        Add area
      </NavLink>
      <NavLink
        appearance="primary"
        layout={layout}
        href="/feed"
        relatedPaths={["/friends"]}
        onClick={onNavigate}
      >
        Feed
      </NavLink>
      <NavLink
        appearance="primary"
        layout={layout}
        href={`/users/${userId}`}
        matchWithin
        onClick={onNavigate}
      >
        My profile
      </NavLink>
    </>
  );
}
