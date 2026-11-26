import {
  createContext,
  useContext,
  useTransition,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";
import { Link as ReactRouterLink, useNavigate } from "react-router";

const PendingContext = createContext(false);

type UrlObject = {
  pathname?: string | null;
  query?: Record<string, string | number | boolean | null | undefined>;
  hash?: string | null;
};

type LinkHref = string | UrlObject;

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: LinkHref;
  replace?: boolean;
  prefetch?: boolean | "auto" | null;
  scroll?: boolean;
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

/** Internal anchors use React Router and publish their transition to the progress bar. */
export default function RouterLink({
  href,
  replace,
  prefetch = false,
  scroll,
  onNavigate,
  onClick,
  target,
  children,
  ...rest
}: LinkProps) {
  const navigate = useNavigate();
  const [pending, startTransition] = useTransition();
  const destination = serializeHref(href);
  if (EXTERNAL_URL_RE.test(destination) || SCHEME_RE.test(destination)) {
    return (
      <a href={destination} target={target} onClick={onClick} {...rest}>
        {children}
      </a>
    );
  }
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.shiftKey ||
      event.metaKey ||
      event.altKey ||
      (target && target !== "_self") ||
      rest.download != null
    )
      return;
    onNavigate?.({ preventDefault: () => event.preventDefault() });
    if (event.defaultPrevented) return;
    event.preventDefault();
    startTransition(() => {
      void navigate(destination, { replace, preventScrollReset: scroll === false });
    });
  }
  return (
    <PendingContext.Provider value={pending}>
      <ReactRouterLink
        to={destination}
        target={target}
        prefetch={prefetch ? "viewport" : "none"}
        onClick={handleClick}
        {...rest}
      >
        {children}
      </ReactRouterLink>
    </PendingContext.Provider>
  );
}

export function useLinkStatus() {
  return { pending: useContext(PendingContext) };
}
