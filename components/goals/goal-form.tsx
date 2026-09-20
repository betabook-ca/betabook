"use client";

import { Button, Checkbox, Input, TextField } from "@heroui/react";
import { ArrowLeft, ArrowRight, ChevronDown, Dumbbell, MapPin, Mountain } from "lucide-react";
import { useId, useRef, useState } from "react";

import { TagInput } from "@/components/journal/tag-input";
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
const SENTENCE_SELECT_TEXT_CLASS = "[&_[data-slot=select-value]]:text-sm! [&_button]:text-sm";
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
const NO_AVAILABLE_TAGS: string[] = [];
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
  tags?: string[];
  amount: string;
  period: GoalInput["timeframe"];
  startDate?: string;
  endDate: string;
  repeat: GoalInput["repeat"];
  recurringEndDate?: string | null;
};

function GoalTagDisclosure({
  kind,
  tags,
  availableTags,
  expanded,
  onToggle,
  onChange,
}: {
  kind: "training" | "volume";
  tags: string[];
  availableTags: string[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (tags: string[]) => void;
}) {
  const disclosureRef = useRef<HTMLButtonElement>(null);
  if (availableTags.length === 0 && tags.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <button
        ref={disclosureRef}
        type="button"
        aria-expanded={expanded}
        className="flex min-h-10 cursor-pointer items-center gap-2 text-left text-sm font-medium focus-visible:status-focused"
        onClick={onToggle}
      >
        <span>Tags {tags.length > 0 ? `(${tags.length} active)` : "(optional)"}</span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-4 text-sm">
          <span>Count {kind === "training" ? "sessions" : "climbs"} with all these tags:</span>
          <TagInput
            value={tags}
            onChange={onChange}
            showUsage={false}
            showLabel={false}
            showHelper={false}
            sentenceLayout
            availableTags={availableTags}
            showExamples={false}
            onTagSelected={() => setTimeout(() => disclosureRef.current?.focus(), 0)}
          />
        </div>
      )}
    </div>
  );
}

function submittedTags(goal: Goal, originalGoal: Goal | undefined, tags: string[]) {
  return goal === "training" || goal === "volume" || originalGoal === goal ? tags : [];
}

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
  onStepChange,
  embedded = false,
  nextGrades = NO_GRADE_HISTORY,
  availableTags = NO_AVAILABLE_TAGS,
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
  onStepChange?: (step: "category" | "details") => void;
  embedded?: boolean;
  nextGrades?: Partial<Record<ClimbType, number>>;
  availableTags?: string[];
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
  const [tags, setTags] = useState<string[]>(draft?.tags ?? []);
  const [tagsExpanded, setTagsExpanded] = useState(Boolean(draft?.tags?.length));
  const [amount, setAmount] = useState(draft?.amount ?? (category === "training" ? "8" : "3"));
  const requestedPeriod = draft?.period ?? (initialCustomDate ? "custom" : "month");
  const [period, setPeriod] = useState<GoalInput["timeframe"]>(
    category === "training" && requestedPeriod === "year" ? "custom" : requestedPeriod,
  );
  const [startDate, setStartDate] = useState(draft?.startDate ?? initialStartDate ?? today);
  const [endDate, setEndDate] = useState(
    draft?.endDate ?? initialEndDate ?? goalWindow("month", today, today).endDate,
  );
  const [hasEndDate, setHasEndDate] = useState(Boolean(draft?.recurringEndDate));
  const [recurringEndDate, setRecurringEndDate] = useState(draft?.recurringEndDate ?? "");
  const initialCadence = draft?.repeat ?? initialRepeat;
  const [recurring, setRecurring] = useState(initialCadence !== "none");
  const [cadence, setCadence] = useState<Exclude<GoalInput["repeat"], "none">>(
    initialCadence === "none" ? "month" : initialCadence,
  );
  const repeat = goal === "grade" || !recurring ? "none" : cadence;
  const selectedRecurringEndDate = repeat !== "none" && hasEndDate ? recurringEndDate : null;
  const invalidRecurringEnd =
    selectedRecurringEndDate !== null &&
    (!selectedRecurringEndDate || selectedRecurringEndDate < today);
  function toggleRecurring(selected: boolean) {
    if (selected && period !== "custom") setCadence(period);
    setRecurring(selected);
  }
  const isEditing = Boolean(initialDraft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const endDateError =
    error === "Choose an end date." ||
    error === "End date must be today or later." ||
    error === "End date must be on or after start date."
      ? error
      : null;
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
  function validationError() {
    if (goal !== "grade" && (!Number.isInteger(Number(amount)) || Number(amount) < 1))
      return "Enter a whole number of at least 1.";
    if (repeat === "none" && period === "custom" && (!startDate || !endDate || endDate < startDate))
      return "End date must be on or after start date.";
    if (selectedRecurringEndDate === "") return "Choose an end date.";
    if (invalidRecurringEnd) return "End date must be today or later.";
    return "";
  }
  function navigate(next: typeof step) {
    setStep(next);
    onStepChange?.(next);
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
                      setHasEndDate(false);
                      setRecurringEndDate("");
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
              className="flex flex-col gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (pending) return;
                const error = validationError();
                if (error) return setError(error);
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
                      recurringEndDate: selectedRecurringEndDate,
                      tags: submittedTags(goal, draft?.goal, tags),
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
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-4">
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
                <div className="flex flex-wrap items-center gap-x-1 gap-y-4">
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-4 text-sm">
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
                          className={`${discipline === "boulder" ? "w-20" : "w-24"} min-w-0 shrink-0 ${SENTENCE_SELECT_TEXT_CLASS}`}
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
                      className={`${sentenceTimeframeWidth(repeat === "none" ? period : repeat)} ${SENTENCE_SELECT_TEXT_CLASS}`}
                      options={timeframeOptions(goal, repeat !== "none")}
                    />
                  </div>
                </div>
                {period === "custom" && repeat === "none" && (
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-4 text-sm [&_.label]:sr-only">
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
                      <DatePickerField
                        label="End date"
                        value={endDate}
                        onChange={(value) => {
                          setEndDate(value);
                          setError("");
                        }}
                        error={endDateError}
                      />
                    </div>
                  </div>
                )}
                {repeat !== "none" && (
                  <div className="flex min-h-10 flex-wrap items-center gap-x-1 gap-y-4 text-sm">
                    <span>until</span>
                    <OptionSelect
                      ariaLabel="Recurrence end"
                      value={hasEndDate ? "date" : "none"}
                      options={[
                        { value: "none", label: "No end date" },
                        { value: "date", label: "Custom date" },
                      ]}
                      className={`w-40 ${SENTENCE_SELECT_TEXT_CLASS}`}
                      onChange={(value) => {
                        setHasEndDate(value === "date");
                        setError("");
                      }}
                    />
                    {hasEndDate && (
                      <span className="[&_.label]:sr-only">
                        <DatePickerField
                          label="End date"
                          value={recurringEndDate}
                          onChange={(value) => {
                            setRecurringEndDate(value);
                            setError("");
                          }}
                          error={endDateError}
                        />
                      </span>
                    )}
                  </div>
                )}
                {category === "training" ? (
                  <GoalTagDisclosure
                    kind="training"
                    tags={tags}
                    availableTags={availableTags}
                    expanded={tagsExpanded}
                    onToggle={() => {
                      setTagsExpanded(!tagsExpanded);
                      setError("");
                    }}
                    onChange={setTags}
                  />
                ) : goal === "volume" ? (
                  <GoalTagDisclosure
                    kind="volume"
                    tags={tags}
                    availableTags={availableTags}
                    expanded={tagsExpanded}
                    onToggle={() => {
                      setTagsExpanded(!tagsExpanded);
                      setError("");
                    }}
                    onChange={setTags}
                  />
                ) : null}
                {error && !endDateError && <InlineAlert>{error}</InlineAlert>}
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
