import type { components } from "@/spa/generated/api";

type Wire = components["schemas"];

export type Area = Wire["PublicAreaDetails"];
export type AreaWithAncestorPath = Wire["PublicAreaResult"];
export type AreaBreadcrumbs = Wire["PublicClimbsPage"]["areaBreadcrumbs"];
export type Climb = Wire["ClimbRecord"];
export type ClimbWithAreaName = Pick<
  Wire["PublicClimb"],
  "id" | "areaId" | "name" | "type" | "grade" | "brokenOn" | "areaName"
>;
export type ClimbSendStats = Wire["ClimbSendStats"];
export type GradeHistogramRow = Wire["GradeHistogramRow"];
export type SuggestedGradeCount = Wire["SuggestedGradeCount"];
export type ClimbListChoice = Wire["ClimbListChoice"];
export type ClimbListItem = Wire["ListItem"];
export type ClimbListSummary = Wire["ListSummary"];
export type ClimbVideo = Wire["ClimbVideo"];
export type CatalogExportInfo = Wire["CatalogExportInfo"];
