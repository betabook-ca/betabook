import { UserSendsFilterToolbar } from "@/components/filters/sends-filter-toolbar";
import { JournalFilterToolbar, JournalTimeline } from "@/components/journal";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { ProductTour } from "@/components/product-tour";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileInvite } from "@/components/profile-invite";
import { ProfileLayout } from "@/components/profile-layout";
import { ProfileTabs } from "@/components/profile-tabs";
import { SharedProfile } from "@/components/shared-profile";
import { SectionHeading } from "@/components/ui/typography";
import { UserSendList } from "@/components/user-send-list";
import type { HardestSend } from "@/lib/analytics-types";
import type { AreaBreadcrumbs } from "@/lib/catalog-types";
import type { JournalFilter } from "@/lib/filters/journal-filter";
import type { UserSendsFilter } from "@/lib/filters/user-sends-filter";
import type { CompanionOption } from "@/lib/journal-companions";
import type { JournalEntry, UserSendRow } from "@/lib/logbook-types";
import type { ProductTourState } from "@/lib/product-tour";
import { profileSharePath } from "@/lib/profile-share";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";

export type JournalViewPayload = {
  hasEntries: boolean;
  firstPage: {
    entries: JournalEntry[];
    hasMore: boolean;
  };
  areaBreadcrumbs: AreaBreadcrumbs;
  tags: string[];
  friends: CompanionOption[];
  filteredClimbName: string | null;
  tourState: ProductTourState | null;
};

export type SendsViewPayload = {
  hasSends: boolean;
  firstPage: {
    sends: UserSendRow[];
    hasMore: boolean;
  };
  areaBreadcrumbs: AreaBreadcrumbs;
  tags: string[];
};

export type SharedProfilePayload = {
  mode: "shared";
  owner: { id: string; name: string; image: string | null };
  token: string;
  hardest: HardestSend[];
  sendCount: number;
  sends: UserSendRow[];
  areaBreadcrumbs: AreaBreadcrumbs;
};

export function SpaSharedProfileView({ payload }: { payload: SharedProfilePayload }) {
  const next = profileSharePath(payload.owner.id, payload.token);
  return (
    <ProfileLayout
      heading={
        <ProfileHeading
          name={payload.owner.name}
          image={payload.owner.image}
          hardest={payload.hardest}
          note={<ProfileInvite name={payload.owner.name} next={next} />}
        />
      }
      tabs={
        <ProfileTabs
          userId={payload.owner.id}
          showJournal={false}
          showTrips={false}
          share={payload.token}
        />
      }
    >
      <SharedProfile
        owner={payload.owner}
        sendCount={payload.sendCount}
        sends={payload.sends}
        areaBreadcrumbs={payload.areaBreadcrumbs}
        next={next}
      />
    </ProfileLayout>
  );
}

export function SpaJournalView({
  ownerId,
  isOwner,
  filter,
  data,
  resultsFilter = filter,
  pending = false,
  loadError,
  basePath,
}: {
  ownerId: string;
  isOwner: boolean;
  filter: JournalFilter;
  data: JournalViewPayload;
  resultsFilter?: JournalFilter;
  pending?: boolean;
  loadError?: string | null;
  basePath?: string;
}) {
  return (
    <NavigationPendingProvider>
      <div className="flex min-w-0 flex-col gap-4">
        {data.tourState && <ProductTour initialState={data.tourState} />}
        <SectionHeading className="sr-only">Journal</SectionHeading>
        {data.hasEntries && (
          <JournalFilterToolbar
            userId={ownerId}
            basePath={basePath}
            tags={data.tags}
            isOwner={isOwner}
            friends={data.friends}
            filter={filter}
            climbName={filter.climbId === resultsFilter.climbId ? data.filteredClimbName : null}
          />
        )}
        {loadError ? (
          <p role="alert">{loadError}</p>
        ) : (
          <JournalTimeline
            key={JSON.stringify(resultsFilter)}
            pending={pending}
            userId={ownerId}
            filter={resultsFilter}
            initialEntries={data.firstPage.entries}
            initialHasMore={data.firstPage.hasMore}
            initialAreaBreadcrumbs={data.areaBreadcrumbs}
            isOwner={isOwner}
            hasAnyEntries={data.hasEntries}
          />
        )}
      </div>
    </NavigationPendingProvider>
  );
}

export async function refineSends(
  previous: ApiResponse<"/api/pages/users/{id}/sends">["sends"],
  userId: string,
  query: string,
  signal: AbortSignal,
) {
  const { areaBreadcrumbs, ...firstPage } = await fetchApi("/api/users/{id}/sends", {
    path: { id: userId },
    query: new URLSearchParams(query),
    signal,
    sessionEvents: true,
  });
  return { ...previous, areaBreadcrumbs, firstPage };
}

export function SpaSendsView({
  ownerId,
  viewerId,
  filter,
  resultsFilter = filter,
  pending = false,
  loadError,
  basePath,
  data,
}: {
  ownerId: string;
  viewerId: string;
  filter: UserSendsFilter;
  resultsFilter?: UserSendsFilter;
  pending?: boolean;
  loadError?: string | null;
  basePath: string;
  data: SendsViewPayload;
}) {
  return (
    <NavigationPendingProvider>
      <div className="flex min-w-0 flex-col gap-4">
        <SectionHeading className="sr-only">Sends</SectionHeading>
        {data.hasSends && (
          <UserSendsFilterToolbar filter={filter} basePath={basePath} tags={data.tags} />
        )}
        {loadError ? (
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
        ) : (
          <UserSendList
            key={JSON.stringify(resultsFilter)}
            userId={ownerId}
            filter={resultsFilter}
            pending={pending}
            initialSends={data.firstPage.sends}
            initialHasMore={data.firstPage.hasMore}
            initialAreaBreadcrumbs={data.areaBreadcrumbs}
            hasAnySends={data.hasSends}
            currentUserId={viewerId}
          />
        )}
      </div>
    </NavigationPendingProvider>
  );
}
