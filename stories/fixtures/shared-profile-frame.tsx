import type { ReactNode } from "react";

import { ProfileHeading } from "@/components/profile-heading";
import { ProfileInvite } from "@/components/profile-invite";
import { ProfileLayout } from "@/components/profile-layout";
import { ProfileTabs } from "@/components/profile-tabs";
import { STORY_HARDEST } from "@/stories/fixtures/climber-hardest";

export const SHARED_OWNER = {
  id: "alex",
  name: "Alex Rivera",
  image: null,
  token: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
};

/** What `SharedProfileHeader` draws, with the hardest sends it reads given. */
export function SharedProfileFrame({ next, children }: { next: string; children: ReactNode }) {
  return (
    <ProfileLayout
      heading={
        <ProfileHeading
          name={SHARED_OWNER.name}
          image={SHARED_OWNER.image}
          hardest={STORY_HARDEST}
          note={<ProfileInvite name={SHARED_OWNER.name} next={next} />}
        />
      }
      tabs={<ProfileTabs userId={SHARED_OWNER.id} showJournal={false} share={SHARED_OWNER.token} />}
    >
      {children}
    </ProfileLayout>
  );
}
