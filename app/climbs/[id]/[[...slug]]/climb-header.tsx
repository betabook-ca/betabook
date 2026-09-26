import type { ReactNode } from "react";

import { BrokenChip } from "@/components/ui/broken-chip";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Grade } from "@/components/ui/grade";
import { PageTitle } from "@/components/ui/typography";
import { formatGrade, type ClimbType } from "@/lib/grades";

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
        <Grade size="md">{formatGrade(climb.type, climb.grade)}</Grade>
        <DisciplineChip type={climb.type} />
        {climb.brokenOn && <BrokenChip brokenOn={climb.brokenOn} />}
      </div>
      {children}
    </div>
  );
}
