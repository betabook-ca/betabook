import { useState } from "react";
import { Outlet, useParams, useSearchParams } from "react-router";

import { FriendshipButton } from "@/components/friendship-button";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileLayout } from "@/components/profile-layout";
import { ProfileTabs } from "@/components/profile-tabs";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { PageErrorBoundary } from "@/spa/lib/render-error-boundary";
import type { VisitorHeader } from "@/spa/lib/visitor-header";

export function VisitorProfileRoute({ viewerId }: { viewerId: string | null }) {
  const { id } = useParams();
  const [search] = useSearchParams();
  if (!id || !viewerId || viewerId === id) return <Outlet />;
  return <VisitorFrame key={JSON.stringify([viewerId, id, search.getAll("share")])} />;
}

function VisitorFrame() {
  const [header, setHeader] = useState<VisitorHeader | null>(null);
  return (
    <ProfileLayout
      heading={
        header && (
          <ProfileHeading
            name={header.user.name}
            image={header.user.image}
            hardest={header.hardest}
            nameAction={
              <FriendshipButton
                userId={header.user.id}
                name={header.user.name}
                initialStatus={header.relationship}
                appearance="profile"
              />
            }
            note={
              !header.access.journal && (
                <p className="text-muted">Their journal isn&apos;t shared with you.</p>
              )
            }
          />
        )
      }
      tabs={
        header && (
          <ProfileTabs
            userId={header.user.id}
            showJournal={header.access.journal}
            showTrips={header.access.trips}
            showLists={header.access.lists}
          />
        )
      }
    >
      <PageErrorBoundary fallback={<SkeletonListRows />}>
        <Outlet context={setHeader} />
      </PageErrorBoundary>
    </ProfileLayout>
  );
}
