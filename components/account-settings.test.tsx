import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { AccountSettings } from "./account-settings";

// Navigation is the only boundary this server-rendered tree needs: the tour
// invitation and theme select read the router. Nothing here asserts on them.
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

function markup(user: { image: string | null; showProfilePhoto: boolean }) {
  return renderToStaticMarkup(
    <AccountSettings
      user={{ id: "alex", name: "Alex Rivera", email: "alex@example.com", ...user }}
      isPrivate={false}
      journalVisibility="friends"
      sendCommentVisibility="public"
      shareUrl="https://betabook.ca/users/alex?share=0123456789abcdef0123456789abcdef"
      turnstileSiteKey={null}
      isAdmin={false}
    />,
  );
}

it("offers the Show photo switch to an account that has a Google photo", () => {
  const html = markup({ image: PHOTO, showProfilePhoto: true });
  expect(html).toContain("Show profile photo");
  expect(html).toContain(PHOTO);
});

it("withholds the switch from an account whose avatar is already initials", () => {
  // Nothing to hide, so the control would be inert: an email/password account
  // with no photo, and a stored value next/image is not configured to load.
  for (const image of [null, "https://example.com/a/avatar"]) {
    const html = markup({ image, showProfilePhoto: true });
    expect(html).not.toContain("Show profile photo");
    expect(html).toContain("Display name");
  }
});

it("shows initials in the account header once the photo is hidden", () => {
  const html = markup({ image: PHOTO, showProfilePhoto: false });
  // The switch stays available so the choice is reversible, but the owner's own
  // header reflects what everyone else now sees.
  expect(html).toContain("Show profile photo");
  expect(html).not.toContain(PHOTO);
  expect(html).toContain("AR");
});
