import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router";

import { SITE_NAME } from "@/lib/site";
import { syncBootstrapPath } from "@/spa/bootstrap";

import { usePublicEntryReady } from "./public-entry";

const PAGE_LABELS: Record<string, string> = {
  "/": SITE_NAME,
  "/search": "Find climbs",
  "/about": "About",
  "/contact": "Contact us",
  "/terms": "Terms of Service",
  "/costs": "Cost transparency",
  "/account": "Account",
  "/account/import": "Import sends",
  "/feed": "Feed",
  "/friends": "Friends",
  "/sign-in": "Sign in",
  "/sign-up": "Sign up",
  "/forgot-password": "Forgot password",
  "/reset-password": "Reset password",
  "/accept-terms": "Review the Terms of Service",
  "/areas/new": "New area",
  "/climbs/new": "New climb",
  "/climbing-logbook": "Free climbing logbook",
  "/kaya-import": "KAYA import",
  "/sendage-import": "Sendage import",
  "/mountain-project-import": "Mountain Project import",
  "/admin/requests": "Moderation requests",
};
const PROFILE_TABS: Record<string, string> = {
  sends: "Sends",
  journal: "Journal",
  goals: "Goals",
  projects: "Projects",
  lists: "Lists",
  trips: "Trips",
  analytics: "Analytics",
};

function fullTitle(label: string) {
  return label === SITE_NAME ? label : label + " · " + SITE_NAME;
}

/** The destination label while a page's authorized entity data loads. */
function routeLabel(path: string, viewer?: { id: string; name: string } | null) {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  const [, group, id, tab] = path.split("/");
  if (group === "users") {
    if (!viewer || viewer.id !== id) return "Member content";
    const suffix =
      tab === "projects" && path.endsWith("/sent") ? "Sent projects" : PROFILE_TABS[tab];
    return suffix ? viewer.name + " · " + suffix : viewer.name;
  }
  if (group === "tutorial") return "Product tour";
  if (group === "terms") return "Terms of Service";
  if (group === "areas") return "Climbing area";
  if (group === "climbs") return "Climb";
  if (group === "projects") return "Shared project";
  if (group === "lists") return "Shared list";
  if (group === "trips") return "Shared trip";
  return "Page not found";
}

/** Publish a title only after the current route's data has resolved. */
export function usePageTitle(label: string | null | undefined, absolute = false) {
  useEffect(() => {
    if (label) document.title = absolute ? label : fullTitle(label);
  }, [label, absolute]);
}

type Position = { x: number; y: number };

/** Lazy routes can initially have neither the requested fragment nor enough
 * height for a history position. Stop retrying when the user takes over. */
function scrollWhenReady(move: () => boolean) {
  if (move()) return;
  const retry = () => {
    if (move()) stop();
  };
  const resize = new ResizeObserver(retry);
  const mutation = new MutationObserver(retry);
  const events = ["wheel", "touchstart", "pointerdown", "keydown"];
  const timer = window.setTimeout(stop, 10000);
  function stop() {
    resize.disconnect();
    mutation.disconnect();
    window.clearTimeout(timer);
    for (const event of events) window.removeEventListener(event, stop);
  }
  resize.observe(document.body);
  mutation.observe(document.body, { childList: true, subtree: true });
  for (const event of events) window.addEventListener(event, stop, { once: true, passive: true });
  return stop;
}

export function DocumentNavigation({ viewer }: { viewer?: { id: string; name: string } | null }) {
  const location = useLocation();
  const navigation = useNavigationType();
  useEffect(
    () => syncBootstrapPath(location.pathname, location.search),
    [location.pathname, location.search],
  );
  // A redirect or a client navigation may supersede the document before
  // the initial route finished. Its frame belongs only to the original path.
  const [entryPath] = useState(location.pathname);
  usePublicEntryReady(location.pathname !== entryPath);
  const destinationTitle = useEffectEvent((path: string) => fullTitle(routeLabel(path, viewer)));
  const previous = useRef(location);
  const positions = useRef(new Map<string, Position>());
  useLayoutEffect(() => {
    const original = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = original;
    };
  }, []);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = location;
    const pathChanged = old.pathname !== location.pathname;
    const shareChanged =
      new URLSearchParams(old.search).get("share") !==
      new URLSearchParams(location.search).get("share");
    if (pathChanged || shareChanged) document.title = destinationTitle(location.pathname);
    const position = positions.current.get(location.key);
    if (old.key !== location.key && navigation === NavigationType.Pop && position)
      return scrollWhenReady(() => {
        window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
        return window.scrollY === position.y && window.scrollX === position.x;
      });
    if (location.hash) {
      let id = location.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* Treat a malformed fragment literally. */
      }
      return scrollWhenReady(() => {
        const target = document.getElementById(id);
        if (!target) return false;
        target.scrollIntoView();
        return true;
      });
    } else if (pathChanged) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [location, navigation]);
  useLayoutEffect(() => {
    const key = location.key;
    const saved = positions.current;
    const remember = () => {
      saved.set(key, { x: window.scrollX, y: window.scrollY });
    };
    if (!saved.has(key)) remember();
    if (saved.size > 200) {
      const first = saved.keys().next().value;
      if (first !== undefined) saved.delete(first);
    }
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, [location.key]);
  return null;
}
