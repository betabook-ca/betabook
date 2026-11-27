import type { components } from "@/spa/generated/api";

type Wire = components["schemas"];

export type EditableSend = Wire["EditableSend"];
export type UserSendRow = Wire["UserSendRow"];
export type JournalEntry = Wire["JournalEntry"];
export type ClimbSendRow = Wire["ClimbSendRow"];
export type SendableClimb = Pick<
  Wire["ClimbRecord"],
  "id" | "areaId" | "type" | "grade" | "brokenOn"
>;
export type PinnedProject = Omit<Wire["PinnedProject"], "sessions">;
export type OpenProject = Wire["Suggestion"];
export type SharedProject = Wire["SharedProject"];
export type SharedProjectSession = Wire["SharedSession"];
export type TripSummary = Wire["MemberTripSummary"];
export type Trip = Pick<
  Wire["MemberTripSummary"],
  "id" | "name" | "description" | "albumUrl" | "startDate" | "endDate"
>;
