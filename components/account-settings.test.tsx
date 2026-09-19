import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { AccountSettings } from "./account-settings";

// The settings tree imports @/actions for its forms, which reaches next/cache
// and drags Next's server tracer into this runner. Nothing here submits, so
// stub the cache boundary instead.
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));
// next/image resolves to an object in this runner, so stand in for it and keep
// the resolved src visible — which photo reaches the avatar is the assertion.
vi.mock("next/image", () => ({
  default: ({ src, unoptimized }: { src: string; unoptimized?: boolean }) => (
    <span data-src={src} data-unoptimized={unoptimized ? "true" : "false"} />
  ),
}));
vi.mock("next/navigation", () => ({
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

  // The stored object is already exactly the size the avatar needs, so it
  // must not go through the image optimizer — unlike the Google URL below.
  expect(html).toContain(`data-src="${UPLOADED}" data-unoptimized="true"`);
  expect(markup(PHOTO)).toContain(`data-src="${PHOTO}" data-unoptimized="false"`);
  expect(html).toContain("Change photo");
  expect(html).toContain("Remove photo");
});
