import type { AnchorHTMLAttributes, MouseEvent } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string | null; search?: string | null; hash?: string | null };
  prefetch?: unknown;
  replace?: unknown;
  scroll?: unknown;
  shallow?: unknown;
  locale?: unknown;
  onNavigate?: unknown;
};

function toHref(href: LinkProps["href"]) {
  return typeof href === "string"
    ? href
    : `${href.pathname ?? ""}${href.search ?? ""}${href.hash ?? ""}`;
}

/** Stands in for next/link in tests, which have no app router: a plain
 * anchor without the router-only props that, like the real Link, keeps a
 * plain left-click for itself instead of letting jsdom navigate. */
export default function Link({
  href,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  locale: _locale,
  onNavigate: _onNavigate,
  onClick,
  children,
  ...props
}: LinkProps) {
  return (
    <a
      href={toHref(href)}
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (!event.defaultPrevented && event.button === 0 && !modified) event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}

/** No navigation is ever in flight without a router. */
export function useLinkStatus() {
  return { pending: false };
}
