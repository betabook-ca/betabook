"use client";

import { Button, Checkbox, Input, TextField } from "@heroui/react";
import { ArrowLeft, ArrowRight, Dumbbell, MapPin, Mountain } from "lucide-react";
import { useId, useRef, useState } from "react";

import { cardClass } from "@/components/ui/card";
import { choicePillClass } from "@/components/ui/choice-pill";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { DISCIPLINE_CHIP_CLASSNAME, DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { FIELD_HEIGHT_CLASS } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionSelect } from "@/components/ui/option-select";
import { PageTitle } from "@/components/ui/typography";
import { goalToday, goalWindow, type GoalInput } from "@/lib/goals";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";

const SENTENCE_GROUP_CLASS = "inline-flex max-w-full items-center gap-1";
const SENTENCE_SHORT_FIELD = "w-20 max-w-full min-w-0";
function sentenceTimeframeWidth(timeframe: string) {
  return timeframe === "custom" ? "w-52 max-w-full shrink-0" : "w-40 shrink-0";
}
function timeframeOptions(
  goal: GoalInput["kind"],
  recurring: boolean,
): { value: GoalInput["timeframe"]; label: string }[] {
  const options: { value: GoalInput["timeframe"]; label: string }[] = [
    { value: "week", label: recurring ? "every week" : "this week" },
    { value: "month", label: recurring ? "every month" : "this month" },
    { value: "year", label: recurring ? "every year" : "this year" },
  ];
  if (!recurring) options.push({ value: "custom", label: "Custom date range" });
  return options.filter((option) => goal !== "training" || option.value !== "year");
}

const NO_GRADE_HISTORY: Partial<Record<ClimbType, number>> = {};
const GOAL_CHOICE_CLASS = "h-auto w-full justify-start gap-3 px-4 py-4 text-left whitespace-normal";

const categories = [
  {
    value: "climbing",
    label: "Climbing goals",
    description: "Build volume or reach a new grade.",
    icon: Mountain,
  },
  {
    value: "training",
    label: "Training",
    description: "Set a session target or a weekly or monthly routine.",
    icon: Dumbbell,
  },
  {
    value: "explore",
    label: "Get out & explore",
    description: "Climb more days or visit more areas.",
    icon: MapPin,
  },
] as const;
type Category = (typeof categories)[number]["value"];
type Goal = GoalInput["kind"];
const goalOptions = {
  climbing: [
    { value: "volume", label: "Send a number of climbs" },
    { value: "grade", label: "Reach a new grade" },
  ],
  training: [{ value: "training", label: "Log training sessions" }],
  explore: [
    { value: "days", label: "Climb on more days" },
    { value: "new-areas", label: "Visit new areas" },
  ],
} satisfies Record<Category, { value: Goal; label: string }[]>;
export type GoalDraft = {
  category: Category;
  goal: Goal;
  discipline: ClimbType;
  grade: string;
  gradeMatch?: "exact" | "at-least";
  amount: string;
  period: GoalInput["timeframe"];
  startDate?: string;
  endDate: string;
  repeat: GoalInput["repeat"];
};

/** Shared goal editor; persistence is supplied by the journal panel. */
// oxlint-disable-next-line complexity -- conditional fields and validation for goal templates
export function GoalForm({
  initialCategory,
  initialGoal,
  initialCustomDate = false,
  initialStartDate,
  initialEndDate,
  initialDraft,
  initialValues,
  onSave,
  onCancel,
  initialRepeat = "none",
  today = goalToday(new Intl.DateTimeFormat().resolvedOptions().timeZone),
  onPendingChange,
  embedded = false,
  nextGrades = NO_GRADE_HISTORY,
}: {
  initialCategory?: Category;
  initialGoal?: Goal;
  initialCustomDate?: boolean;
  initialStartDate?: string;
  initialEndDate?: string;
  initialDraft?: GoalDraft;
  initialValues?: GoalDraft;
  onSave?: (draft: GoalDraft) => void | Promise<void>;
  today?: string;
  onPendingChange?: (pending: boolean) => void;
  embedded?: boolean;
  nextGrades?: Partial<Record<ClimbType, number>>;
  onCancel?: () => void;
  initialRepeat?: GoalInput["repeat"];
}) {
  const draft = initialDraft ?? initialValues;
  const [category, setCategory] = useState<Category>(
    draft?.category ?? initialCategory ?? "climbing",
  );
  const [step, setStep] = useState<"category" | "details">(
    draft || initialCategory ? "details" : "category",
  );
  const [goal, setGoal] = useState<Goal>(
    draft?.goal ?? initialGoal ?? goalOptions[category][0].value,
  );
  const [discipline, setDiscipline] = useState<ClimbType>(draft?.discipline ?? "boulder");
  const [grade, setGrade] = useState(
    draft?.grade ?? (initialGoal === "grade" ? String(nextGrades.boulder ?? 0) : "any"),
  );
  const [gradeMatch, setGradeMatch] = useState<"exact" | "at-least">(draft?.gradeMatch ?? "exact");
  const [amount, setAmount] = useState(draft?.amount ?? (category === "training" ? "8" : "3"));
  const requestedPeriod = draft?.period ?? (initialCustomDate ? "custom" : "month");
  const [period, setPeriod] = useState<GoalInput["timeframe"]>(
    category === "training" && requestedPeriod === "year" ? "custom" : requestedPeriod,
  );
  const [startDate, setStartDate] = useState(draft?.startDate ?? initialStartDate ?? today);
  const [endDate, setEndDate] = useState(
    draft?.endDate ?? initialEndDate ?? goalWindow("month", today, today).endDate,
  );
  const initialCadence = draft?.repeat ?? initialRepeat;
  const [recurring, setRecurring] = useState(initialCadence !== "none");
  const [cadence, setCadence] = useState<Exclude<GoalInput["repeat"], "none">>(
    initialCadence === "none" ? "month" : initialCadence,
  );
  const repeat = goal === "grade" || !recurring ? "none" : cadence;
  function toggleRecurring(selected: boolean) {
    if (selected && period !== "custom") setCadence(period);
    setRecurring(selected);
  }
  const isEditing = Boolean(initialDraft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const backRef = useRef<HTMLButtonElement>(null);
  const categoryRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const grades = nativeGradeArray(discipline);
  const gradeOptions = grades.map((label, i) => ({ value: String(i), label }));
  const isClimbing = category === "climbing";
  const unit =
    goal === "training"
      ? "Number of training sessions"
      : goal === "days"
        ? "Climbing days"
        : isClimbing
          ? "Number of climbs"
          : "Number of areas";
  function navigate(next: typeof step) {
    setStep(next);
    requestAnimationFrame(() => {
      (next === "details" ? backRef : categoryRef).current?.focus();
    });
  }

  return (
    <div
      className={`mx-auto flex w-full flex-col gap-3 text-foreground ${step === "details" ? "max-w-lg" : "max-w-xl"}`}
    >
      <section className={`flex flex-col gap-3 ${embedded ? "" : cardClass("sm", "bordered")}`}>
        {step === "category" ? (
          <>
            <div>
              <PageTitle className="text-foreground">What do you want to work on?</PageTitle>
            </div>
            <div className="flex flex-col gap-3">
              {categories.map(({ value, label, description, icon: Icon }, index) => (
                <Button
                  key={value}
                  ref={index === 0 ? categoryRef : undefined}
                  variant="outline"
                  className={GOAL_CHOICE_CLASS}
                  onPress={() => {
                    if (value !== category) {
                      setRecurring(false);
                      setCadence("month");
                      setPeriod("month");
                      setGoal(goalOptions[value][0].value);
                      setAmount(value === "climbing" ? "3" : "8");
                    }
                    setCategory(value);
                    setError("");
                    navigate("details");
                  }}
                >
                  <Icon aria-hidden className="size-5 shrink-0" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-sm font-normal text-muted">{description}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0" />
                </Button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Button
                ref={backRef}
                isDisabled={pending}
                variant="ghost"
                onPress={() => (isEditing && onCancel ? onCancel() : navigate("category"))}
              >
                <ArrowLeft aria-hidden className="size-4" />
                Back
              </Button>
            </div>
            <PageTitle className="text-2xl!">
              {categories.find((item) => item.value === category)?.label}
            </PageTitle>
            <form
              className="flex flex-col gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (pending) return;
                if (goal !== "grade" && (!Number.isInteger(Number(amount)) || Number(amount) < 1)) {
                  setError("Enter a whole number of at least 1.");
                  return;
                }
                if (
                  repeat === "none" &&
                  period === "custom" &&
                  (!startDate || !endDate || endDate < startDate)
                ) {
                  setError("End date must be on or after start date.");
                  return;
                }
                setError("");
                setPending(true);
                onPendingChange?.(true);
                try {
                  if (onSave)
                    await onSave({
                      category,
                      goal,
                      discipline,
                      grade,
                      gradeMatch: goal === "volume" && grade !== "any" ? gradeMatch : "exact",
                      amount: goal === "grade" ? "1" : amount,
                      period,
                      startDate,
                      endDate,
                      repeat,
                    });
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Could not save the goal. Try again.",
                  );
                } finally {
                  setPending(false);
                  onPendingChange?.(false);
                }
              }}
            >
              <fieldset disabled={pending} className="contents">
                {category !== "training" && (
                  <div className="flex flex-col gap-2">
                    <div
                      className="grid auto-cols-fr grid-flow-col gap-3"
                      role="group"
                      aria-label="Goal"
                    >
                      {goalOptions[category].map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          aria-pressed={goal === option.value}
                          variant="outline"
                          style={
                            goal === option.value
                              ? { backgroundColor: "var(--button-bg-hover)" }
                              : undefined
                          }
                          className="h-auto min-h-16 w-full justify-start rounded-panel! px-3 py-3 text-left text-sm whitespace-normal"
                          onPress={() => {
                            setGoal(option.value);
                            if (option.value === "grade" && grade === "any")
                              setGrade(
                                String(
                                  Math.min(
                                    nextGrades[discipline] ?? 0,
                                    nativeGradeArray(discipline).length - 1,
                                  ),
                                ),
                              );
                          }}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                  {isClimbing && (
                    <fieldset>
                      <legend className="sr-only">Climbing discipline</legend>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(DISCIPLINE_LABELS) as ClimbType[]).map((value) => (
                          <label
                            key={value}
                            className={`${choicePillClass(discipline === value, DISCIPLINE_CHIP_CLASSNAME[value])} inline-flex items-center has-focus-visible:status-focused`}
                          >
                            <input
                              type="radio"
                              name={`${id}-discipline`}
                              className="sr-only"
                              checked={discipline === value}
                              onChange={() => {
                                setDiscipline(value);
                                if (goal === "grade" || grade !== "any")
                                  setGrade(
                                    String(
                                      Math.min(
                                        nextGrades[value] ?? 0,
                                        nativeGradeArray(value).length - 1,
                                      ),
                                    ),
                                  );
                              }}
                            />
                            {DISCIPLINE_LABELS[value]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {goal !== "grade" && (
                    <Checkbox
                      isSelected={repeat !== "none"}
                      onChange={(selected) => {
                        toggleRecurring(selected);
                        setError("");
                      }}
                    >
                      <Checkbox.Content className="flex items-center gap-2">
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <span className="text-sm">Make this a recurring goal</span>
                      </Checkbox.Content>
                    </Checkbox>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-1 gap-y-5">
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    {goal !== "grade" && (
                      <div className={SENTENCE_GROUP_CLASS}>
                        <span className="whitespace-nowrap">
                          {goal === "training"
                            ? "Train"
                            : goal === "days"
                              ? "Climb on"
                              : goal === "new-areas"
                                ? "Visit"
                                : "Send"}
                        </span>
                        <TextField
                          value={amount}
                          onChange={setAmount}
                          className={SENTENCE_SHORT_FIELD}
                          isRequired
                        >
                          <Input
                            aria-label={unit}
                            type="number"
                            min={1}
                            max={1000}
                            step={1}
                            className={`${FIELD_HEIGHT_CLASS} text-sm!`}
                          />
                        </TextField>
                      </div>
                    )}
                    {isClimbing ? (
                      <div className={SENTENCE_GROUP_CLASS}>
                        <span className="whitespace-nowrap">
                          {goal === "volume" ? "climbs at" : "Send my first"}
                        </span>
                        <OptionSelect
                          ariaLabel="Grade"
                          value={grade}
                          onChange={setGrade}
                          options={
                            goal === "grade"
                              ? gradeOptions
                              : [{ value: "any", label: "Any" }, ...gradeOptions]
                          }
                          className={`${discipline === "boulder" ? "w-20" : "w-24"} min-w-0 shrink-0 [&_[data-slot=select-value]]:text-sm! [&_button]:text-sm`}
                        />
                        {goal === "volume" && grade !== "any" && (
                          <Checkbox
                            isSelected={gradeMatch === "at-least"}
                            onChange={(checked) => setGradeMatch(checked ? "at-least" : "exact")}
                          >
                            <Checkbox.Content className="flex items-center gap-1">
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              <span className="text-sm whitespace-nowrap">or harder</span>
                            </Checkbox.Content>
                          </Checkbox>
                        )}
                      </div>
                    ) : (
                      <span className="whitespace-nowrap">
                        {goal === "training"
                          ? amount === "1"
                            ? "time"
                            : "times"
                          : goal === "days"
                            ? amount === "1"
                              ? "day"
                              : "days"
                            : amount === "1"
                              ? "new area"
                              : "new areas"}
                      </span>
                    )}
                  </div>
                  <div className="flex max-w-full items-center gap-1 text-sm">
                    {period !== "custom" && repeat === "none" && (
                      <span className="shrink-0">by the end of</span>
                    )}
                    <OptionSelect
                      ariaLabel="Timeframe"
                      value={repeat === "none" ? period : repeat}
                      onChange={(value) => {
                        if (repeat === "none") setPeriod(value);
                        else if (value !== "custom") setCadence(value);
                        setError("");
                      }}
                      className={`${sentenceTimeframeWidth(repeat === "none" ? period : repeat)} [&_[data-slot=select-value]]:text-sm! [&_button]:text-sm`}
                      options={timeframeOptions(goal, repeat !== "none")}
                    />
                  </div>
                </div>
                {period === "custom" && repeat === "none" && (
                  <div className="flex flex-wrap items-center gap-1 text-sm [&_.date-input-group]:text-sm [&_.label]:sr-only [&_[role=spinbutton]]:text-sm">
                    <div className={SENTENCE_GROUP_CLASS}>
                      <span>between</span>
                      <DatePickerField
                        label="Start date"
                        value={startDate}
                        onChange={setStartDate}
                      />
                    </div>
                    <div className={SENTENCE_GROUP_CLASS}>
                      <span>and</span>
                      <DatePickerField label="End date" value={endDate} onChange={setEndDate} />
                    </div>
                  </div>
                )}
                {error && <InlineAlert>{error}</InlineAlert>}
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-separator pt-4">
                  <Button type="submit" isPending={pending}>
                    {isEditing ? "Save changes" : "Create goal"}
                  </Button>
                </div>
              </fieldset>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
