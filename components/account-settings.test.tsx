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
  default: ({ src }: { src: string }) => <span data-src={src} />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

const PHOTO = "https://lh3.googleusercontent.com/a/alex=s96-c";

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
