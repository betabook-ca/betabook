import type { AreaBreadcrumbs, ClimbSendStats, ClimbWithAreaName } from "@/db/queries";

/** One page of /api/search/climbs in its full (non-suggestion) shape — what
 * the home search and the climb picker both page through. `count` only comes
 * back for a request that asked for it. */
export type ClimbListPage = {
  climbs: ClimbWithAreaName[];
  hasNextPage: boolean;
  sendStats: Record<number, ClimbSendStats>;
  areaBreadcrumbs: AreaBreadcrumbs;
  /** Sent ids for this page only; omitted for signed-out viewers. */
  sentClimbIds?: number[];
  count?: number;
};

/** Per-row metadata accumulated as the viewer loads more climbs. A fresh
 * server snapshot replaces this object along with the accumulated rows. */
export type ClimbListMeta = {
  sendStats: Record<number, ClimbSendStats>;
  areaBreadcrumbs: AreaBreadcrumbs;
  sentClimbIds?: Set<number>;
};

export function createClimbListMeta({
  sendStats,
  areaBreadcrumbs,
  sentClimbIds,
}: {
  sendStats: Record<number, ClimbSendStats>;
  areaBreadcrumbs: AreaBreadcrumbs;
  sentClimbIds?: Iterable<number>;
}): ClimbListMeta {
  return {
    sendStats,
    areaBreadcrumbs,
    sentClimbIds: sentClimbIds === undefined ? undefined : new Set(sentClimbIds),
  };
}

/** Add one newly loaded page's metadata to the visible list. */
export function mergeClimbListMeta(current: ClimbListMeta, incoming: ClimbListMeta): ClimbListMeta {
  return {
    sendStats: { ...current.sendStats, ...incoming.sendStats },
    areaBreadcrumbs: { ...current.areaBreadcrumbs, ...incoming.areaBreadcrumbs },
    sentClimbIds:
      incoming.sentClimbIds === undefined
        ? undefined
        : new Set([...(current.sentClimbIds ?? []), ...incoming.sentClimbIds]),
  };
}
