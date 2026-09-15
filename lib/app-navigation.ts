export type PrimaryArea = "logbook" | "progress" | "community" | "you";

export type PrimaryDestination = { id: PrimaryArea; label: string; href: string };

export const AREA_LABELS: Record<PrimaryArea, string> = {
  logbook: "Logbook",
  progress: "Progress",
  community: "Community",
  you: "You",
};

export function primaryDestinations(userId: string): readonly PrimaryDestination[] {
  return [
    { id: "logbook", label: AREA_LABELS.logbook, href: `/users/${userId}/journal` },
    { id: "progress", label: AREA_LABELS.progress, href: `/users/${userId}/goals` },
    { id: "community", label: AREA_LABELS.community, href: "/feed" },
    { id: "you", label: AREA_LABELS.you, href: "/account" },
  ] as const;
}

function within(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function primaryAreaForPath(pathname: string, userId: string): PrimaryArea | undefined {
  const owner = `/users/${userId}`;
  if (within(pathname, "/account")) return "you";
  if (
    within(pathname, `${owner}/goals`) ||
    within(pathname, `${owner}/projects`) ||
    within(pathname, `${owner}/analytics`)
  )
    return "progress";
  if (within(pathname, owner)) return "logbook";
  if (within(pathname, "/feed") || within(pathname, "/friends") || pathname.startsWith("/users/"))
    return "community";
  return undefined;
}

export function workspaceTabs(
  area: Exclude<PrimaryArea, "you">,
  userId: string,
): { label: string; href: string; roots: string[] }[] {
  const owner = `/users/${userId}`;
  switch (area) {
    case "logbook":
      return [
        { label: "Journal", href: `${owner}/journal`, roots: [owner] },
        { label: "Sends", href: `${owner}/sends`, roots: [] },
      ];
    case "progress":
      return [
        { label: "Goals", href: `${owner}/goals`, roots: [] },
        { label: "Open Projects", href: `${owner}/projects`, roots: [] },
        { label: "Analytics", href: `${owner}/analytics`, roots: [] },
      ];
    default:
      return [
        { label: "Feed", href: "/feed", roots: [] },
        { label: "Friends", href: "/friends", roots: [] },
      ];
  }
}
