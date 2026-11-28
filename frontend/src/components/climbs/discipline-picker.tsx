import { Description, Label } from "@heroui/react";
import { useId } from "react";

import {
  DISCIPLINE_CHIP_CLASSNAME,
  DISCIPLINE_LABELS,
} from "@/components/climbing/discipline-chip";
import { choicePillClass } from "@/components/ui/choice-pill";
import type { ClimbType } from "@/lib/grades";

/** The climb form's discipline choice: one pill per discipline, each wearing
 * its chip color once chosen. Native radios rather than ChoicePills, because
 * the choice takes part in the surrounding form: `required` blocks submit and
 * `disabled` follows the form's fieldset while a save is in flight. */
export function DisciplinePicker({
  value,
  onChange,
  isRequired = false,
  isDisabled = false,
  description,
}: {
  value: ClimbType;
  onChange: (value: ClimbType) => void;
  isRequired?: boolean;
  isDisabled?: boolean;
  /** Why the choice is locked, or other help shown under the pills. */
  description?: string;
}) {
  const name = useId();
  const descriptionId = useId();
  return (
    <fieldset disabled={isDisabled} aria-describedby={description ? descriptionId : undefined}>
      <legend className="mb-2">
        <Label isRequired={isRequired}>Discipline</Label>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(DISCIPLINE_LABELS) as ClimbType[]).map((discipline) => (
          <label
            key={discipline}
            className={`${choicePillClass(value === discipline, DISCIPLINE_CHIP_CLASSNAME[discipline])} has-focus-visible:status-focused has-disabled:cursor-not-allowed has-disabled:opacity-60`}
          >
            <input
              type="radio"
              name={name}
              value={discipline}
              checked={value === discipline}
              onChange={() => onChange(discipline)}
              required={isRequired}
              className="sr-only"
            />
            {DISCIPLINE_LABELS[discipline]}
          </label>
        ))}
      </div>
      {description && (
        <Description id={descriptionId} className="mt-2 block">
          {description}
        </Description>
      )}
    </fieldset>
  );
}
