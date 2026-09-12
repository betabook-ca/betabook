import type { Metadata } from "next";

import { AccountSettings } from "@/components/account-settings";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { getDb } from "@/db/client";
import { getUser } from "@/db/queries";
import { getTurnstileSiteKey } from "@/lib/auth";
import { getCatalogExportBucket, getCatalogExportInfo } from "@/lib/catalog-export";
import { getOwnProfileShareUrl } from "@/lib/profile-share-url";
import { getMemberSession as getSession, isAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: "Account settings",
  robots: { index: false },
};

export default async function AccountPage() {
  const session = await getSession();

  if (!session) {
    return <CurrentPageAuthCallout />;
  }

  const db = await getDb();
  const user = await getUser(db, session.user.id);
  const isPrivate = user?.isPrivate ?? false;

  return (
    <AccountSettings
      user={{
        id: session.user.id,
        name: user?.name ?? session.user.name,
        email: session.user.email,
        image: user?.image ?? session.user.image,
      }}
      isPrivate={isPrivate}
      journalVisibility={user?.journalVisibility ?? "friends"}
      sendCommentVisibility={user?.sendCommentVisibility ?? "public"}
      shareUrl={await getOwnProfileShareUrl(db, { id: session.user.id, isPrivate })}
      turnstileSiteKey={await getTurnstileSiteKey()}
      catalogExport={await getCatalogExportInfo(await getCatalogExportBucket())}
      isAdmin={isAdmin({ user: { role: user?.role } })}
    />
  );
}
