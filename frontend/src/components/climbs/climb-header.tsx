import type { ReactNode } from "react";

import { BrokenChip } from "@/components/climbing/broken-chip";
import { DisciplineChip } from "@/components/climbing/discipline-chip";
import { Grade } from "@/components/climbing/grade";
import { GradeLabel } from "@/components/climbing/grade-label";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PageTitle } from "@/components/ui/typography";
import type { ClimbType } from "@/lib/grades";

type ClimbHeaderProps = {
  climb: { name: string; type: ClimbType; grade: number | null; brokenOn: string | null };
  eyebrow?: string;
  /** The description block, which the public and member pages render differently. */
  children: ReactNode;
};

export function ClimbHeader({ climb, eyebrow, children }: ClimbHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <PageTitle>{climb.name}</PageTitle>
      <div className="mt-1 flex items-center gap-2">
        <Grade size="md">
          <GradeLabel type={climb.type} grade={climb.grade} />
        </Grade>
        <DisciplineChip type={climb.type} />
        {climb.brokenOn && <BrokenChip brokenOn={climb.brokenOn} />}
      </div>
      {children}
    </div>
  );
}
