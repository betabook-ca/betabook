import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Route, Routes } from "react-router";

import { HeaderNavigation } from "@/components/app-menu";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTabBar } from "@/components/app-tab-bar";
import { SearchPaletteProvider, SearchTrigger } from "@/components/command-palette";
import { HeaderAuthLinks } from "@/components/header-auth-links";
import { HeaderLogButton } from "@/components/header-log-button";
import { MobileAppHelper } from "@/components/mobile-app-helper";
import { TermsGate } from "@/components/terms-gate";
import { AppLink } from "@/components/ui/app-link";
import { GradePreferencesProvider } from "@/components/ui/grade-preferences";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { ViewerBoundary } from "@/components/viewer-boundary";
import { WorkspaceLoadingModule } from "@/components/workspace-loading";
import { authClient } from "@/lib/auth-client";
import { gradePreferencesFor } from "@/lib/grade-preferences";
import { COSTS_PAGE, LOGBOOK_PAGE } from "@/lib/landing-pages";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { CURRENT_TERMS_PROMPT } from "@/lib/terms";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { DocumentNavigation } from "@/spa/lib/document-navigation";
import { Providers } from "@/spa/providers";

const SearchRoute = lazy(() => import("@/spa/routes/search-route"));
const AreaRoute = lazy(() => import("@/spa/routes/area-route"));
const ClimbRoute = lazy(() => import("@/spa/routes/climb-route"));
const NewAreaRoute = lazy(() => import("@/spa/routes/new-area-route"));
const NewClimbRoute = lazy(() => import("@/spa/routes/new-climb-route"));
const ProfileAnalyticsRoute = lazy(() => import("@/spa/routes/profile-analytics-route"));
const TripsRoute = lazy(() => import("@/spa/routes/trips-route"));
const FeedRoute = lazy(() => import("@/spa/routes/feed-route"));
const FriendsRoute = lazy(() => import("@/spa/routes/friends-route"));
const ImportRoute = lazy(() => import("@/spa/routes/import-route"));

const AdminRequestsRoute = lazy(() => import("@/spa/routes/admin-requests-route"));
const AccountRoute = lazy(() => import("@/spa/routes/account-route"));
const UserProfileRoute = lazy(() => import("@/spa/routes/user-profile-route"));
const UserSendsRoute = lazy(() => import("@/spa/routes/user-sends-route"));
const ListsRoute = lazy(() => import("@/spa/routes/lists-route"));
const UserJournalRoute = lazy(() => import("@/spa/routes/user-journal-route"));
const AuthRouteView = lazy(() => import("@/spa/routes/auth-routes"));
const InfoRouteView = lazy(() => import("@/spa/routes/info-routes"));
const GoalsRoute = lazy(() => import("@/spa/routes/goals-route"));
const ProjectsRoute = lazy(() => import("@/spa/routes/projects-route"));
const TutorialRoute = lazy(() => import("@/spa/routes/tutorial-route"));
const NotFoundRoute = lazy(() => import("@/spa/routes/not-found-route"));

type TermsCheckState = { viewerId: string; status: ApiResponse<"/api/terms/status"> | null };

function RouteFallback() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-56" />
      <SkeletonListRows rows={6} />
    </div>
  );
}

/** Root SPA application shell mirroring `app/layout.tsx` + `app/template.tsx`. */
export function App() {
  const { data: session, refetch } = authClient.useSession();
  const viewerId = session?.user.id ?? null;
  const [termsState, setTermsState] = useState<TermsCheckState>();
  useEffect(() => {
    function handleSessionRefresh() {
      void refetch();
    }
    window.addEventListener("betabook:session-refresh", handleSessionRefresh);
    return () => {
      window.removeEventListener("betabook:session-refresh", handleSessionRefresh);
    };
  }, [refetch]);

  useEffect(() => {
    if (!viewerId) {
      return;
    }
    const targetViewer = viewerId;
    const controller = new AbortController();
    async function checkTerms() {
      try {
        const status = await fetchApi("/api/terms/status", { signal: controller.signal });
        if (!controller.signal.aborted && status.userId === targetViewer)
          setTermsState({ viewerId: targetViewer, status });
      } catch {
        if (!controller.signal.aborted) setTermsState({ viewerId: targetViewer, status: null });
      }
    }
    void checkTerms();
    return () => controller.abort();
  }, [viewerId, session?.user.termsAcceptedAt, session?.user.termsVersion]);

  const activeTerms = termsState?.viewerId === viewerId ? termsState?.status : undefined;
  const termsPrompt = activeTerms ?? CURRENT_TERMS_PROMPT;
  const boulderGradeScale = session?.user.boulderGradeScale;
  const ropeGradeScale = session?.user.ropeGradeScale;
  const gradePreferences = useMemo(
    () => gradePreferencesFor({ boulderGradeScale, ropeGradeScale }),
    [boulderGradeScale, ropeGradeScale],
  );

  return (
    <>
      <DocumentNavigation viewer={session?.user} />
      <a
        href="#main"
        // oxlint-disable-next-line tailwindcss/no-conflicting-classes
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:text-foreground"
      >
        Skip to content
      </a>
      <Suspense>
        <NavigationProgress />
      </Suspense>
      <WorkspaceLoadingModule />
      <Providers>
        <SearchPaletteProvider>
          <AppSidebar>
            <header className="flex h-14 shrink-0 items-center px-4">
              <div
                className={`mx-auto grid w-full ${PAGE_MAX_WIDTH_CLASS} grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 md:grid-cols-[minmax(8rem,1fr)_minmax(0,32rem)_minmax(8rem,1fr)] md:gap-4`}
              >
                <div>
                  <HeaderNavigation />
                </div>
                <div className="min-w-0">
                  <SearchTrigger />
                </div>
                <div className="flex min-w-11 items-center justify-end gap-3">
                  <HeaderLogButton />
                  <div className="hidden md:flex">
                    <HeaderAuthLinks />
                  </div>
                </div>
              </div>
            </header>
            <main id="main" tabIndex={-1} className="flex-1 p-4 outline-none md:pt-2">
              <div className={`mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`}>
                <ViewerBoundary key={viewerId ?? "anonymous"} viewerId={viewerId}>
                  <TermsGate
                    viewerId={viewerId}
                    initiallyRequired={activeTerms?.required ?? false}
                    version={termsPrompt.version}
                    versionLabel={termsPrompt.versionLabel}
                    previousVersion={termsPrompt.previousVersion}
                  >
                    <GradePreferencesProvider value={gradePreferences}>
                      <Suspense fallback={<RouteFallback />}>
                        <Routes>
                          <Route path="/" element={<SearchRoute viewerId={viewerId} home />} />
                          <Route path="/search" element={<SearchRoute viewerId={viewerId} />} />
                          <Route
                            path="/users/:id/analytics"
                            element={<ProfileAnalyticsRoute viewerId={viewerId} />}
                          />
                          <Route path="/feed" element={<FeedRoute viewerId={viewerId} />} />
                          <Route path="/friends" element={<FriendsRoute viewerId={viewerId} />} />
                          <Route
                            path="/account/import"
                            element={<ImportRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/admin/requests"
                            element={<AdminRequestsRoute viewerId={viewerId} />}
                          />
                          <Route path="/account" element={<AccountRoute viewerId={viewerId} />} />
                          <Route
                            path="/users/:id"
                            element={<UserProfileRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/users/:id/sends"
                            element={<UserSendsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/users/:id/journal"
                            element={<UserJournalRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/users/:id/goals"
                            element={<GoalsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/users/:id/projects"
                            element={<ProjectsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/users/:id/projects/sent"
                            element={<ProjectsRoute viewerId={viewerId} sent />}
                          />
                          <Route
                            path="/projects/:token"
                            element={<ProjectsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/users/:id/lists/:listId?"
                            element={<ListsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/lists/:token"
                            element={<ListsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/users/:id/trips"
                            element={<TripsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/users/:id/trips/:tripId"
                            element={<TripsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/users/:id/trips/:tripId/analytics"
                            element={<TripsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/trips/:token"
                            element={<TripsRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/trips/:token/analytics"
                            element={<TripsRoute viewerId={viewerId} />}
                          />
                          <Route path="/areas/new" element={<NewAreaRoute viewerId={viewerId} />} />
                          <Route path="/areas/:id" element={<AreaRoute viewerId={viewerId} />} />
                          <Route path="/areas/:id/*" element={<AreaRoute viewerId={viewerId} />} />
                          <Route
                            path="/climbs/new"
                            element={<NewClimbRoute viewerId={viewerId} />}
                          />
                          <Route path="/climbs/:id" element={<ClimbRoute viewerId={viewerId} />} />
                          <Route
                            path="/climbs/:id/*"
                            element={<ClimbRoute viewerId={viewerId} />}
                          />
                          <Route
                            path="/sign-in"
                            element={<AuthRouteView kind="sign-in" viewerId={viewerId} />}
                          />
                          <Route
                            path="/sign-up"
                            element={<AuthRouteView kind="sign-up" viewerId={viewerId} />}
                          />
                          <Route
                            path="/forgot-password"
                            element={<AuthRouteView kind="forgot-password" viewerId={viewerId} />}
                          />
                          <Route
                            path="/reset-password"
                            element={<AuthRouteView kind="reset-password" viewerId={viewerId} />}
                          />
                          <Route
                            path="/accept-terms"
                            element={
                              <AuthRouteView
                                kind="accept-terms"
                                viewerId={viewerId}
                                termsStatus={activeTerms}
                              />
                            }
                          />
                          <Route path="/about" element={<InfoRouteView kind="about" />} />
                          <Route path="/terms" element={<InfoRouteView kind="terms" />} />
                          <Route
                            path="/terms/:version"
                            element={<InfoRouteView kind="terms-version" />}
                          />
                          <Route path="/contact" element={<InfoRouteView kind="contact" />} />
                          <Route
                            path="/climbing-logbook"
                            element={<InfoRouteView kind="climbing-logbook" />}
                          />
                          <Route
                            path="/kaya-import"
                            element={<InfoRouteView kind="kaya-import" />}
                          />
                          <Route
                            path="/sendage-import"
                            element={<InfoRouteView kind="sendage-import" />}
                          />
                          <Route
                            path="/mountain-project-import"
                            element={<InfoRouteView kind="mountain-project-import" />}
                          />
                          <Route path="/costs" element={<InfoRouteView kind="costs" />} />
                          <Route
                            path="/tutorial/:tourId/:stepId?"
                            element={<TutorialRoute viewerId={viewerId} />}
                          />
                          <Route path="*" element={<NotFoundRoute />} />
                        </Routes>
                      </Suspense>
                    </GradePreferencesProvider>
                  </TermsGate>
                </ViewerBoundary>
              </div>
            </main>
            <footer className="border-t border-separator px-4 py-4 text-sm text-muted">
              <div
                className={`mx-auto flex w-full ${PAGE_MAX_WIDTH_CLASS} flex-wrap items-center justify-between gap-2`}
              >
                <span>
                  {/* oxlint-disable-next-line node/no-process-env -- build-time year injected by Vite define */}
                  &copy; {process.env.NEXT_PUBLIC_BUILD_YEAR} {SITE_NAME} —{" "}
                  <span className="whitespace-nowrap">{SITE_TAGLINE}</span>
                </span>
                <div className="flex flex-wrap items-center gap-4">
                  <AppLink href="/about">About</AppLink>
                  <AppLink href={LOGBOOK_PAGE.path}>Features</AppLink>
                  <AppLink href={COSTS_PAGE.path}>Costs</AppLink>
                  <AppLink href="/contact">Contact us</AppLink>
                  <AppLink href="/terms">Terms of Service</AppLink>
                </div>
              </div>
            </footer>
            <AppTabBar />
            <MobileAppHelper />
          </AppSidebar>
        </SearchPaletteProvider>
      </Providers>
    </>
  );
}
