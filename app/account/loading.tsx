import {
  SETTINGS_PANEL_BODY_CLASS,
  SETTINGS_ROW_CLASS,
  SETTINGS_SECTION_CLASS,
  settingsPanelClass,
} from "@/components/ui/settings";
import { Skeleton } from "@/components/ui/skeleton";

const SECTIONS = [
  { id: "profile", rows: 2 },
  { id: "privacy", rows: 4 },
  { id: "sends", rows: 2 },
  { id: "preferences", rows: 2 },
  { id: "sign-in", rows: 2 },
];

/** Mirrors the account page's header, settings sections and delete panel. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Skeleton className="size-16 shrink-0" rounded="rounded-full" />
          <Skeleton className="h-9 w-48 max-w-full" />
        </div>
        <Skeleton className="h-10 w-28 shrink-0" rounded="rounded-full" />
      </div>
      {SECTIONS.map(({ id, rows }) => (
        <div key={id} className={SETTINGS_SECTION_CLASS}>
          <Skeleton className="h-7 w-24 lg:mt-5" />
          <div className={settingsPanelClass()}>
            <div className={SETTINGS_PANEL_BODY_CLASS}>
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className={`flex flex-col gap-2 ${SETTINGS_ROW_CLASS}`}>
                  <Skeleton tone="raised" className="h-5 w-32" />
                  <Skeleton tone="raised" className="h-4 w-64 max-w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      <div className={SETTINGS_SECTION_CLASS}>
        <Skeleton className="h-7 w-32 lg:mt-5" />
        <div className={settingsPanelClass("danger")}>
          <div className={SETTINGS_PANEL_BODY_CLASS}>
            <div className={`flex flex-col gap-3 ${SETTINGS_ROW_CLASS}`}>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-36" rounded="rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
