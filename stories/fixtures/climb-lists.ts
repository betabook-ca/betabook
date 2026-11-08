import type {
  AreaBreadcrumbs,
  ClimbListChoice,
  ClimbListItem,
  ClimbListSummary,
} from "@/db/queries";

const UPDATED = Date.parse("2026-10-30T18:00:00Z");

export const climbListSamples: ClimbListSummary[] = [
  {
    id: 1,
    title: "Red River classics",
    description: "Moderates worth the drive, roughly in the order I want to do them.",
    climbCount: 5,
    updatedAt: UPDATED,
  },
  {
    id: 2,
    title: "Bishop wishlist",
    description: null,
    climbCount: 12,
    updatedAt: UPDATED - 86_400_000,
  },
  { id: 3, title: "Winter circuit", description: null, climbCount: 1, updatedAt: UPDATED - 1 },
];

function item(
  number: number,
  climb: Pick<ClimbListItem, "climbId" | "name" | "type" | "grade" | "areaId" | "areaName">,
  sent: boolean | null,
): ClimbListItem {
  return {
    ...climb,
    brokenOn: null,
    position: number,
    number,
    addedAt: UPDATED - number * 3_600_000,
    sent,
  };
}

/** Five climbs in the owner's order, with the reader's sent state. */
export const climbListItemSamples: ClimbListItem[] = [
  item(
    1,
    {
      climbId: 101,
      name: "Amarillo Sunset",
      type: "sport",
      grade: 12,
      areaId: 21,
      areaName: "Drive-By Crag",
    },
    true,
  ),
  item(
    2,
    {
      climbId: 102,
      name: "Gift of the Magi",
      type: "sport",
      grade: 9,
      areaId: 22,
      areaName: "Global Village",
    },
    false,
  ),
  item(
    3,
    {
      climbId: 103,
      name: "Breakfast Burrito",
      type: "sport",
      grade: 11,
      areaId: 23,
      areaName: "Muir Valley",
    },
    false,
  ),
  item(
    4,
    {
      climbId: 104,
      name: "The Return of Darth Moll",
      type: "sport",
      grade: 15,
      areaId: 21,
      areaName: "Drive-By Crag",
    },
    false,
  ),
  item(
    5,
    {
      climbId: 105,
      name: "Rat Stew",
      type: "trad",
      grade: 8,
      areaId: 22,
      areaName: "Global Village",
    },
    true,
  ),
];

export const climbListBreadcrumbs: AreaBreadcrumbs = {
  21: [{ id: 20, name: "Red River Gorge" }],
  22: [{ id: 20, name: "Red River Gorge" }],
  23: [{ id: 20, name: "Red River Gorge" }],
};

export const climbListChoiceSamples: ClimbListChoice[] = [
  { id: 1, title: "Red River classics", climbCount: 5, hasClimb: true },
  { id: 2, title: "Bishop wishlist", climbCount: 12, hasClimb: false },
  { id: 3, title: "Winter circuit", climbCount: 1, hasClimb: false },
];
