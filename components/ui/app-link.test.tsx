import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppLink } from "./app-link";

const nextLink = vi.hoisted(() => vi.fn<(props: ComponentProps<typeof AppLink>) => void>());

// Observe the Next.js boundary while rendering the real AppLink with React.
vi.mock("next/link", () => ({
  default: (props: ComponentProps<typeof AppLink>) => {
    nextLink(props);
    return <a href={typeof props.href === "string" ? props.href : undefined}>{props.children}</a>;
  },
}));

describe("AppLink prefetching", () => {
  beforeEach(() => nextLink.mockClear());

  it("does not ask Next.js to prefetch links just because they enter the viewport", () => {
    const html = renderToStaticMarkup(<AppLink href="/areas/1/north-woods">North Woods</AppLink>);

    expect(html).toContain('href="/areas/1/north-woods"');
    expect(nextLink).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ href: "/areas/1/north-woods", prefetch: false }),
    );
  });

  it.each([false, true, null, "auto"] as const)("preserves explicit prefetch=%s", (prefetch) => {
    renderToStaticMarkup(
      <AppLink href="/about" prefetch={prefetch}>
        About
      </AppLink>,
    );

    expect(nextLink).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ prefetch }));
  });
});
