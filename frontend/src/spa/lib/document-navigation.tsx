import { useEffect, useLayoutEffect, useRef } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router";

import { SITE_NAME } from "@/lib/site";

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

/** A POP can land on a lazy route whose skeleton is shorter than the saved
 * scroll position. Retry when its content grows, until the user interacts. */
function restore(position: Position) {
  const move = () => window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
  move();
  if (window.scrollY === position.y && window.scrollX === position.x) return;
  const observer = new ResizeObserver(() => {
    move();
    if (window.scrollY === position.y && window.scrollX === position.x) stop();
  });
  const events = ["wheel", "touchstart", "pointerdown", "keydown"];
  const timer = window.setTimeout(stop, 10000);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
    for (const event of events) window.removeEventListener(event, stop);
  }
  observer.observe(document.body);
  for (const event of events) window.addEventListener(event, stop, { once: true, passive: true });
  return stop;
}

export function DocumentNavigation({ viewer }: { viewer?: { id: string; name: string } | null }) {
  const location = useLocation();
  const navigation = useNavigationType();
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
    if (old.key === location.key) return;
    const pathChanged = old.pathname !== location.pathname;
    const shareChanged =
      new URLSearchParams(old.search).get("share") !==
      new URLSearchParams(location.search).get("share");
    if (pathChanged || shareChanged)
      document.title = fullTitle(routeLabel(location.pathname, viewer));
    const position = positions.current.get(location.key);
    if (navigation === NavigationType.Pop && position) return restore(position);
    if (location.hash) {
      let id = location.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* Treat a malformed fragment literally. */
      }
      document.getElementById(id)?.scrollIntoView();
    } else if (pathChanged) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [location, navigation, viewer]);
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
