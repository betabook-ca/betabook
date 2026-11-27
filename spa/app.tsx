import { Toast, useTheme } from "@heroui/react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { RouterProvider } from "react-aria-components";
import { Route, Routes } from "react-router";

import { useIsAtLeast } from "@/hooks/use-breakpoint";
import { SITE_NAME } from "@/lib/site";
import { syncBootstrapPath } from "@/spa/bootstrap";
import { fetchJson, type AuthSession } from "@/spa/lib/fetch-json";
import Link from "@/spa/shims/next-link";
import { usePathname, useRouter } from "@/spa/shims/next-navigation";

const HomeRoute = lazy(() => import("@/spa/routes/home-route"));
const AreaRoute = lazy(() => import("@/spa/routes/area-route"));
const ClimbRoute = lazy(() => import("@/spa/routes/climb-route"));
const SignInRoute = lazy(() => import("@/spa/routes/sign-in-route"));
const PlaceholderRoute = lazy(() => import("@/spa/routes/placeholder-route"));

function RouteFallback() {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
      Loading page...
    </div>
  );
}

/** Root SPA application component mounted inside `BrowserRouter`. */
export function App() {
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useIsAtLeast("md");
  const [session, setSession] = useState<AuthSession>(null);
  useTheme("system");

  const refreshSession = useCallback(async () => {
    try {
      const next = await fetchJson<AuthSession>("/api/auth/get-session");
      setSession(next);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    syncBootstrapPath(pathname);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const next = await fetchJson<AuthSession>("/api/auth/get-session");
        if (!cancelled) {
          setSession(next);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
        }
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RouterProvider navigate={router.push}>
      <div className="flex min-h-full flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
            <Link href="/" className="font-display text-xl font-bold tracking-tight no-underline">
              {SITE_NAME}
            </Link>
            <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
              <Link href="/" className="link no-underline">
                Catalog
              </Link>
              {/* oxlint-disable-next-line next/no-html-link-for-pages -- intentionally requests zero-JS Rust static document */}
              <a href="/about" className="link no-underline">
                About
              </a>
              {/* oxlint-disable-next-line next/no-html-link-for-pages -- intentionally requests zero-JS Rust static document */}
              <a href="/terms" className="link no-underline">
                Terms
              </a>
              {session ? (
                <Link href="/sign-in" className="link font-medium no-underline">
                  {session.user.name}
                </Link>
              ) : (
                <Link href="/sign-in" className="link font-medium no-underline">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/areas/:id/*" element={<AreaRoute />} />
              <Route path="/areas/:id" element={<AreaRoute />} />
              <Route path="/climbs/:id/*" element={<ClimbRoute />} />
              <Route path="/climbs/:id" element={<ClimbRoute />} />
              <Route
                path="/sign-in"
                element={<SignInRoute session={session} onSessionChange={refreshSession} />}
              />
              <Route path="*" element={<PlaceholderRoute />} />
            </Routes>
          </Suspense>
        </main>

        <Toast.Provider placement={desktop ? "top end" : "top"} className="top-16" />
      </div>
    </RouterProvider>
  );
}
