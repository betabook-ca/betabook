import { shownProfilePhoto } from "@/lib/profile-photo";

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

/** The account fields navigation renders. */
export type MenuAccount = { id: string; name: string; image?: string | null; isAdmin: boolean };

/** Navigation renders its avatar from the Better Auth client session rather
 * than a D1 read, so the Show photo setting is applied here — shared by the
 * header menu and the sidebar so the two can't disagree. Both extra fields are
 * optional because Better Auth types additionalFields that way (lib/auth.ts);
 * `show_profile_photo` is NOT NULL DEFAULT 1, so a session that predates this
 * field shows the photo, as it did before. */
export function menuAccount(user: {
  id: string;
  name: string;
  image?: string | null;
  role?: string | null;
  showProfilePhoto?: boolean | null;
}): MenuAccount {
  return {
    id: user.id,
    name: user.name,
    image: shownProfilePhoto({
      image: user.image ?? null,
      showProfilePhoto: user.showProfilePhoto ?? true,
    }),
    isAdmin: user.role === "admin",
  };
}
