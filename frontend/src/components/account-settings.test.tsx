import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { AccountSettings } from "./account-settings";

vi.mock("@/spa/lib/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

const PHOTO = "https://lh3.googleusercontent.com/a/alex=s96-c";
const UPLOADED = "/api/avatars/alex/abababababababababababababababab.webp";

function markup(image: string | null) {
  return renderToStaticMarkup(
    <AccountSettings
      user={{ id: "alex", name: "Alex Rivera", email: "alex@example.com", image }}
      isPrivate={false}
      journalVisibility="friends"
      sendCommentVisibility="public"
      tripVisibility="public"
      climbListVisibility="friends"
      gradePreferences={{ boulder: "hueco", rope: "yds" }}
      sendAlerts={{ shareWithFriends: true, receive: true }}
      pushPublicKey={null}
      shareUrl="https://betabook.ca/users/alex?share=0123456789abcdef0123456789abcdef"
      turnstileSiteKey={null}
      isAdmin={false}
      catalogExport={null}
    />,
  );
}

it("offers removal to an account whose photo is on screen", () => {
  const html = markup(PHOTO);
  expect(html).toContain("Remove photo");
  expect(html).toContain("Profile photo");
  expect(html).toContain(PHOTO);
});

it("withholds removal from an account that already shows initials", () => {
  // An email/password account, and a stored value next/image is not configured
  // to load: neither renders a photo, so there is nothing to remove.
  for (const image of [null, "https://example.com/a/avatar"]) {
    const html = markup(image);
    expect(html).not.toContain("Remove photo");
    // The section itself still renders, so this isn't passing on a crash.
    expect(html).toContain("Display name");
    expect(html).toContain("AR");
  }
});

it("offers an upload to every account, photo or not", () => {
  // Unlike the Google-only row this replaced, which appeared only for an
  // account that already had a photo.
  expect(markup(null)).toContain("Upload photo");
  expect(markup("https://example.com/a/avatar")).toContain("Upload photo");
  expect(markup(PHOTO)).toContain("Change photo");
});

it("serves an uploaded photo straight from its own URL", () => {
  const html = markup(UPLOADED);

  expect(html).toContain(`src="${UPLOADED}"`);
  expect(markup(PHOTO)).toContain(`src="${PHOTO}"`);
  expect(html).toContain("Change photo");
  expect(html).toContain("Remove photo");
});
