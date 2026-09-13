"use client";

import { Plus } from "lucide-react";

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
      <NavLink
        appearance="primary"
        layout={layout}
        href="/climbs/new"
        relatedPaths={["/areas/new"]}
        aria-label={direction === "row" ? "Add a climb or area" : undefined}
        className="gap-1.5"
        onClick={onNavigate}
      >
        <Plus aria-hidden className="size-4" />
        {direction === "row" ? "Add" : "Add a climb or area"}
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
