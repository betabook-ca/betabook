import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import type { SuggestedClimberRow } from "@/db/queries";

import { FriendSuggestions } from "./friend-suggestions";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/actions", () => ({
  requestFriendship: vi.fn<() => Promise<never>>(),
  acceptFriendRequest: vi.fn<() => Promise<never>>(),
  cancelFriendRequest: vi.fn<() => Promise<never>>(),
  declineFriendRequest: vi.fn<() => Promise<never>>(),
  removeFriendship: vi.fn<() => Promise<never>>(),
}));
const climber = (id: string, name: string, mutualFriendCount: number): SuggestedClimberRow => ({
  id,
  name,
  image: null,
  friendshipStatus: "none",
  mutualFriendCount,
});

it("server-renders each suggestion's profile link, friends in common and friend request action", () => {
  const html = renderToStaticMarkup(
    <FriendSuggestions
      climbers={[climber("sam", "Sam Rivera", 2), climber("jordan", "Jordan Park", 1)]}
    />,
  );
  expect(html).toMatch(/<section[^>]*aria-label="You may know"/);
  expect(html).toMatch(/<h2[^>]*>You may know<\/h2>/);
  expect(html).toMatch(/<h3[^>]*>(?:(?!<\/h3>).)*href="\/users\/sam"[^>]*>Sam Rivera<\/a><\/h3>/s);
  expect(html).toMatch(/>2 mutual friends</);
  expect(html).toMatch(/>1 mutual friend</);
  expect(html).toContain('aria-label="Add friend: Sam Rivera"');
  expect(html).toContain('aria-label="Add friend: Jordan Park"');
  expect(html.indexOf("Sam Rivera")).toBeLessThan(html.indexOf("Jordan Park"));
});

it("renders nothing without suggestions", () => {
  expect(renderToStaticMarkup(<FriendSuggestions climbers={[]} />)).toBe("");
});
