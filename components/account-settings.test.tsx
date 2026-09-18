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
  // Nothing to explain away while the control works.
  expect(html).not.toContain("Sign in with Google to show one");
});

it("keeps the switch visible but disabled when there is no photo to show", () => {
  // An email/password account, and a stored value next/image is not configured
  // to load: both only ever render initials, so the switch stays but says why
  // instead of vanishing and looking like a missing setting.
  for (const image of [null, "https://example.com/a/avatar"]) {
    const html = markup({ image, showProfilePhoto: true });
    expect(html).toContain("Show profile photo");
    expect(html).toContain("disabled");
    // The tooltip body is portalled and only exists while open, so the
    // server-rendered proof is its trigger; the text is asserted in jsdom.
    expect(html).toContain("Why can&#x27;t I show a photo?");
    expect(html).toContain("Your initials appear anywhere you show up.");
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
