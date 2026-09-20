export type PrimaryArea = "logbook" | "progress" | "community" | "account";

export type PrimaryDestination = { id: PrimaryArea; label: string; href: string };

export const AREA_LABELS: Record<PrimaryArea, string> = {
  logbook: "Logbook",
  progress: "Progress",
  community: "Community",
  account: "Account settings",
};

export const ACCOUNT_DESTINATION: PrimaryDestination = {
  id: "account",
  label: AREA_LABELS.account,
  href: "/account",
};

export function primaryDestinations(userId: string): readonly PrimaryDestination[] {
  return [
    { id: "logbook", label: AREA_LABELS.logbook, href: `/users/${userId}/journal` },
    { id: "progress", label: AREA_LABELS.progress, href: `/users/${userId}/goals` },
    { id: "community", label: AREA_LABELS.community, href: "/feed" },
  ] as const;
}

function within(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function primaryAreaForPath(pathname: string, userId: string): PrimaryArea | undefined {
  const owner = `/users/${userId}`;
  if (within(pathname, "/account")) return "account";
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
  area: Exclude<PrimaryArea, "account">,
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
        // Open and Sent are sub-tabs inside this one, so /projects/sent nests
        // under it and WorkspaceShell's prefix match is what keeps Projects
        // lit while the climber is on either.
        { label: "Projects", href: `${owner}/projects`, roots: [] },
        { label: "Analytics", href: `${owner}/analytics`, roots: [] },
      ];
    default:
      return [
        { label: "Feed", href: "/feed", roots: [] },
        { label: "Friends", href: "/friends", roots: [] },
      ];
  }
}
