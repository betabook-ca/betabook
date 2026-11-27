import type { components } from "@/spa/generated/api";

type Wire = components["schemas"];

export type AnalyticsSendRow = Wire["AnalyticsSend"];
export type AnalyticsSessionRow = Wire["AnalyticsSession"];
export type ClimberOverview = Wire["ClimberOverview"];
export type HardestSend = Wire["HardestSend"];
