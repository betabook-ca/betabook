import { endOfMonth, parseDate } from "@internationalized/date";

import { isRealIsoDate } from "@/lib/sends";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

export type DateFilterValue = {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Presets keep the concrete dates chosen in the viewer's local calendar. */
  datePreset?: RelativeDatePreset;
};

const RELATIVE_PRESETS = new Set(["this-month", "this-year", "last-year"]);

export function parseDateFilter(params: UrlParamsRecord): DateFilterValue {
  const date = toArray(params.date)[0];
  if (date && isRealIsoDate(date)) return { date };
  const rawFrom = toArray(params.dateFrom)[0];
  const rawTo = toArray(params.dateTo)[0];
  let dateFrom = rawFrom && isRealIsoDate(rawFrom) ? rawFrom : undefined;
  let dateTo = rawTo && isRealIsoDate(rawTo) ? rawTo : undefined;
  if (dateFrom && dateTo && dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];
  const rawPreset = toArray(params.datePreset)[0];
  return {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(dateFrom && dateTo && RELATIVE_PRESETS.has(rawPreset)
      ? { datePreset: rawPreset as RelativeDatePreset }
      : {}),
  };
}

export function appendDateFilterParams(params: URLSearchParams, filter: DateFilterValue): void {
  if (filter.date) params.set("date", filter.date);
  else {
    if (filter.dateFrom) params.set("dateFrom", filter.dateFrom);
    if (filter.dateTo) params.set("dateTo", filter.dateTo);
    if (filter.dateFrom && filter.dateTo && filter.datePreset)
      params.set("datePreset", filter.datePreset);
  }
}

export type RelativeDatePreset = "this-month" | "this-year" | "last-year";

export function datePresetFilter(
  preset: RelativeDatePreset,
  referenceDate: string,
): DateFilterValue {
  const current = parseDate(referenceDate);
  const year = preset === "last-year" ? current.year - 1 : current.year;
  const start = current.set({ year, month: preset === "this-month" ? current.month : 1, day: 1 });
  const end = preset === "this-month" ? endOfMonth(start) : start.set({ month: 12, day: 31 });
  return {
    date: undefined,
    dateFrom: start.toString(),
    dateTo: end.toString(),
    datePreset: preset,
  };
}
