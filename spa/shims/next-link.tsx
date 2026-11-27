import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { Link as ReactRouterLink } from "react-router";

export type UrlObject = {
  pathname?: string | null;
  query?: Record<string, string | number | boolean | null | undefined>;
  hash?: string | null;
};

export type LinkHref = string | UrlObject;

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: LinkHref;
  replace?: boolean;
  prefetch?: boolean | "auto" | null;
  scroll?: boolean;
  shallow?: boolean;
  locale?: string | false;
  passHref?: boolean;
  legacyBehavior?: boolean;
  as?: LinkHref;
  onNavigate?: (event: { preventDefault: () => void }) => void;
};

const EXTERNAL_URL_RE = /^(?:[a-z][a-z\d+.-]*:)?\/\//i;
const SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;

function serializeHref(href: LinkHref): string {
  if (typeof href === "string") {
    return href;
  }
  const pathname = href.pathname ?? "";
  const search = new URLSearchParams();
  if (href.query) {
    for (const [key, value] of Object.entries(href.query)) {
      if (value != null) {
        search.set(key, String(value));
      }
    }
  }
  const query = search.toString();
  const hash = href.hash ? `#${href.hash.replace(/^#/, "")}` : "";
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

/** React Router-backed compatibility shim for `next/link`. */
export default function Link({
  href,
  replace,
  prefetch: _prefetch,
  scroll: _scroll,
  shallow: _shallow,
  locale: _locale,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  as: _as,
  onNavigate,
  onClick,
  target,
  ...rest
}: LinkProps) {
  const destination = serializeHref(href);
  const isExternal =
    EXTERNAL_URL_RE.test(destination) || SCHEME_RE.test(destination) || target === "_blank";

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    onNavigate?.({
      preventDefault: () => event.preventDefault(),
    });
  };

  if (isExternal) {
    return (
      <a href={destination} target={target} onClick={handleClick} {...rest}>
        {rest.children}
      </a>
    );
  }

  return (
    <ReactRouterLink
      to={destination}
      replace={replace}
      target={target}
      onClick={handleClick}
      {...rest}
    />
  );
}

/** Minimal `next/link` `useLinkStatus` compatibility hook for SPA builds. */
export function useLinkStatus(): { pending: boolean } {
  return { pending: false };
}
