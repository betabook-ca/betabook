import type { SearchResult } from "@/components/search/search-types";
import type { AreaSelection } from "@/lib/area-selection";

/** Fictional IDs are never passed to real routes or mutations. */
export const SAMPLE_AREAS: AreaSelection[] = [
  { id: "area-1", name: "Cedar Grove", path: "California / North Woods" },
  { id: "area-2", name: "Upper Wall", path: "California / North Woods" },
  { id: "area-3", name: "Cedar Grove", path: "Oregon / Coast Range" },
  { id: "area-11", name: "Lower boulders", path: "California / North Woods / Cedar Grove" },
];

export type SearchFixture = Exclude<SearchResult, { kind: "climb"; discipline?: never }> & {
  areaId?: string;
  rating?: number;
  sent?: boolean;
  friend?: boolean;
};

export const CATALOG_FIXTURES: SearchFixture[] = [
  {
    id: "climb-101",
    kind: "climb",
    name: "Cedar Arete",
    detail: "North Woods / Cedar Grove",
    discipline: "boulder",
    grade: 5,
    areaId: "area-1",
    rating: 4,
    sent: true,
  },
  {
    id: "climb-102",
    kind: "climb",
    name: "Cedar Crack",
    detail: "North Woods / Upper Wall",
    discipline: "trad",
    grade: 10,
    areaId: "area-2",
    rating: 3,
  },
  {
    id: "climb-103",
    kind: "climb",
    name: "Cedar Slab",
    detail: "North Woods / Cedar Grove",
    discipline: "sport",
    grade: 8,
    areaId: "area-1",
    rating: 2,
    sent: true,
  },
  {
    id: "climb-104",
    kind: "climb",
    name: "Cedar Corner",
    detail: "North Woods / Cedar Grove",
    discipline: "trad",
    grade: 9,
    areaId: "area-1",
    rating: 4,
  },
  {
    id: "climb-105",
    kind: "climb",
    name: "Cedar Traverse",
    detail: "North Woods / Lower boulders",
    discipline: "boulder",
    grade: 7,
    areaId: "area-11",
    rating: 3,
  },
  {
    id: "climb-106",
    kind: "climb",
    name: "Cedar Arete",
    detail: "Coast Range / Cedar Grove",
    discipline: "boulder",
    grade: 4,
    areaId: "area-3",
    rating: 4,
  },
  {
    id: "climb-107",
    kind: "climb",
    name: "A very long cedar climb name above the far end of the eastern ridge",
    detail: "California / North Woods / Cedar Grove / The far eastern ridge",
    discipline: "sport",
    grade: null,
    areaId: "area-1",
    rating: 0,
  },
  {
    id: "climb-108",
    kind: "climb",
    name: "North Face",
    detail: "North Woods / Upper Wall",
    discipline: "trad",
    grade: 12,
    areaId: "area-2",
    rating: 4,
  },
  ...SAMPLE_AREAS.map((area): SearchFixture => ({
    id: area.id,
    kind: "area",
    name: area.name,
    detail: area.path,
  })),
  {
    id: "climber-201",
    kind: "climber",
    name: "Cedar Lee",
    detail: "Climbing partner",
    friend: true,
  },
  { id: "climber-202", kind: "climber", name: "Cedar West", detail: "Climber" },
  {
    id: "climber-203",
    kind: "climber",
    name: "Riley Chen",
    detail: "Climbing partner",
    friend: true,
  },
];

export const SAMPLE_JOURNAL = [
  {
    id: "entry-1",
    name: "Cedar Arete",
    detail: "September 5 · Worked the upper moves",
    kind: "sessions",
  },
  { id: "entry-2", name: "Fingerboard", detail: "September 4 · Easy repeaters", kind: "training" },
  {
    id: "entry-3",
    name: "Cedar Slab",
    detail: "September 2 · A quiet morning at the crag",
    kind: "sessions",
  },
];
