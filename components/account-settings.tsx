import { buttonVariants } from "@heroui/react";
import { ShieldCheck, Upload } from "lucide-react";

import { CatalogExportDownload } from "@/components/catalog-export-download";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { DisplayNameForm } from "@/components/display-name-form";
import { ExportSendsButton } from "@/components/export-sends-button";
import { PrivacyControls } from "@/components/privacy-controls";
import { PrivacyDetails } from "@/components/privacy-fields";
import { ProductTour } from "@/components/product-tour";
import { RemoveProfilePhotoButton } from "@/components/remove-profile-photo-button";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { ShareProfileControls } from "@/components/share-profile-controls";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeSelect } from "@/components/theme-select";
import { AppLink } from "@/components/ui/app-link";
import { SETTINGS_ROW_CLASS, SettingsRow, SettingsSection } from "@/components/ui/settings";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { CatalogExportInfo } from "@/lib/catalog-export";
import type { SendCommentAudience, SharingAudience } from "@/lib/privacy";
import { getGoogleProfileImageUrl } from "@/lib/user-initials";

const OUTLINE_LINK_CLASS = `${buttonVariants({ variant: "outline" })} gap-2 text-foreground`;

export function AccountSettings({
  user,
  isPrivate,
  journalVisibility,
  sendCommentVisibility,
  shareUrl,
  turnstileSiteKey,
  catalogExport,
  isAdmin,
}: {
  user: { id: string; name: string; email: string; image?: string | null };
  isPrivate: boolean;
  journalVisibility: SharingAudience;
  sendCommentVisibility: SendCommentAudience;
  /** Null while the profile is private. */
  shareUrl: string | null;
  turnstileSiteKey?: string | null;
  /** Null until the first weekly snapshot has been written. */
  catalogExport: CatalogExportInfo | null;
  isAdmin: boolean;
}) {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <h1 className="sr-only">Account settings</h1>
      <header className="flex min-h-12 items-center gap-3">
        <UserAvatar name={user.name} image={user.image} size="md" />
        <p className="min-w-0 truncate text-lg font-semibold">{user.name}</p>
      </header>

      <SettingsSection id="profile" title="Profile">
        <div className={SETTINGS_ROW_CLASS}>
          <DisplayNameForm initialName={user.name} />
        </div>
        {/* Only offered when a photo is actually on screen: an account with
            none, or with a URL next/image won't load, already shows initials. */}
        {getGoogleProfileImageUrl(user.image) !== null && (
          <SettingsRow
            title="Profile photo"
            description="From your Google account. Remove it to show your initials instead."
          >
            <RemoveProfilePhotoButton />
          </SettingsRow>
        )}
        <div className={SETTINGS_ROW_CLASS}>
          <ShareProfileControls name={user.name} url={shareUrl} />
        </div>
      </SettingsSection>

      <SettingsSection id="privacy" title="Privacy">
        <PrivacyControls
          initialIsPrivate={isPrivate}
          initialJournalVisibility={journalVisibility}
          initialSendCommentVisibility={sendCommentVisibility}
        />
        <PrivacyDetails />
      </SettingsSection>

      <SettingsSection id="sends" title="Sends">
        <SettingsRow
          title="Import history"
          description="From Sendage, KAYA, Mountain Project or a CSV file."
        >
          <AppLink href="/account/import" className={OUTLINE_LINK_CLASS}>
            <Upload aria-hidden="true" className="size-4" />
            Import sends
          </AppLink>
        </SettingsRow>
        <SettingsRow title="Download a copy" description="Every send, as a CSV file.">
          <ExportSendsButton userId={user.id} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="catalog" title="Catalog">
        <CatalogExportDownload info={catalogExport} />
      </SettingsSection>

      <SettingsSection id="preferences" title="Preferences">
        <SettingsRow title="Theme" description="On this device." inline>
          <ThemeSelect />
        </SettingsRow>
        <SettingsRow
          title="Getting started"
          description="Learn to log sessions, add friends and set privacy."
        >
          <ProductTour />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="sign-in" title="Sign-in">
        <SettingsRow title={user.email} description="Signed in on this device.">
          <SignOutButton />
        </SettingsRow>
        <SettingsRow title="Password" description="We'll email you a link to set a new one.">
          <ResetPasswordButton email={user.email} turnstileSiteKey={turnstileSiteKey} />
        </SettingsRow>
      </SettingsSection>

      {isAdmin && (
        <SettingsSection id="moderation" title="Moderation">
          <SettingsRow title="Change requests" description="For the areas you moderate.">
            <AppLink href="/admin/requests" className={OUTLINE_LINK_CLASS}>
              <ShieldCheck aria-hidden="true" className="size-4" />
              Review requests
            </AppLink>
          </SettingsRow>
        </SettingsSection>
      )}

      <SettingsSection id="delete-account" title="Delete account" tone="danger">
        <SettingsRow description="Permanently removes your account and climbing history. Export your sends first.">
          <DeleteAccountButton />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
