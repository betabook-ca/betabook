import { AppLink } from "@/components/ui/app-link";
import { choicePillClass } from "@/components/ui/choice-pill";
import { DISCIPLINE_CHIP_CLASSNAME, DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import type { ClimbType } from "@/lib/grades";

/** The analytics discipline switch: one pill per discipline the climber has
 * logged, and nothing when there is only one to choose from. */
export function DisciplineScopeNav({
  present,
  scope,
  href,
}: {
  present: readonly ClimbType[];
  scope: ClimbType;
  href: (type: ClimbType) => string;
}) {
  if (present.length < 2) return null;
  return (
    <nav aria-label="Discipline" className="flex flex-wrap gap-2">
      {present.map((type) => {
        const selected = type === scope;
        return (
          <AppLink
            key={type}
            href={href(type)}
            aria-current={selected ? "true" : undefined}
            className={choicePillClass(selected, DISCIPLINE_CHIP_CLASSNAME[type])}
          >
            {DISCIPLINE_LABELS[type]}
          </AppLink>
        );
      })}
    </nav>
  );
}
