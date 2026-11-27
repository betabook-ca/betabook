import type { FeedDay } from "@/db/queries/feed";

const northWoodsAncestors = [
  { id: 10, name: "Cascadia" },
  { id: 20, name: "North Woods" },
];

export const feedStoryClimbs = [
  {
    climbId: 1,
    climbName: "Cedar Arete",
    climbType: "boulder",
    climbGrade: 5,
    areaId: 30,
    areaName: "Upper Boulders",
    areaAncestors: northWoodsAncestors,
  },
  {
    climbId: 2,
    climbName: "Pine Slab",
    climbType: "boulder",
    climbGrade: 4,
    areaId: 31,
    areaName: "Lower Slabs",
    areaAncestors: northWoodsAncestors,
  },
  {
    climbId: 3,
    climbName: "Birch Wall",
    climbType: "boulder",
    climbGrade: 7,
    areaId: 30,
    areaName: "Upper Boulders",
    areaAncestors: northWoodsAncestors,
  },
] satisfies Pick<
  FeedDay["activities"][number],
  "climbId" | "climbName" | "climbType" | "climbGrade" | "areaId" | "areaName" | "areaAncestors"
>[];
