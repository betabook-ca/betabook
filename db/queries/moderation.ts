import { eq, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { Area } from "@/db/queries/areas";
import { adminAreaScopes, areas, changeRequests, climbs } from "@/db/schema";

export type ChangeRequest = typeof changeRequests.$inferSelect;

export type RequestScope = { request: ChangeRequest; scopeAreaIds: number[] };
type ReviewQueueCursor = { requestedAt: number; id: number };
export type ReviewQueueOptions = { after?: ReviewQueueCursor; limit?: number };
export const REVIEW_QUEUE_PAGE_SIZE = 25;

/** Recheck live roles, grants and ancestry in the same statement as the decision. */
export function moderationAuthorizedSql(
  reviewerId: string,
  request: Pick<ChangeRequest, "type" | "entityId" | "payload">,
  {
    approvalRequestId,
    requireAll = true,
  }: { approvalRequestId?: number; requireAll?: boolean } = {},
): SQL {
  const payload = JSON.parse(request.payload);
  const requiredAreas = [
    request.type.startsWith("area_")
      ? sql`SELECT (SELECT id FROM areas WHERE id = ${request.entityId})`
      : sql`SELECT (SELECT area_id FROM climbs WHERE id = ${request.entityId})`,
  ];
  if (request.type === "area_reparent")
    requiredAreas.push(sql`SELECT (SELECT id FROM areas WHERE id = ${payload.newParentId})`);
  else if (request.type === "climb_move")
    requiredAreas.push(sql`SELECT (SELECT id FROM areas WHERE id = ${payload.newAreaId})`);
  else if (request.type === "climb_merge")
    requiredAreas.push(
      sql`SELECT (SELECT area_id FROM climbs WHERE id = ${payload.targetClimbId})`,
    );

  return sql`EXISTS (
    WITH RECURSIVE required(area_id) AS (${sql.join(requiredAreas, sql` UNION `)}),
    ancestors(area_id, ancestor_id) AS (
      SELECT area_id, area_id FROM required
      UNION
      SELECT a.area_id, parent.parent_id FROM ancestors a
      JOIN areas parent ON parent.id = a.ancestor_id WHERE parent.parent_id IS NOT NULL
    ), covered(user_id, area_id) AS (
      SELECT u.id, a.area_id FROM user u
      JOIN admin_area_scopes s ON s.user_id = u.id
      JOIN ancestors a ON a.ancestor_id = s.area_id
      WHERE u.role = 'admin' AND (
        u.id = ${reviewerId}
        ${approvalRequestId === undefined ? sql`` : sql`OR u.id IN (SELECT user_id FROM change_request_approvals WHERE request_id = ${approvalRequestId})`}
      )
    )
    SELECT 1 WHERE EXISTS (SELECT 1 FROM covered WHERE user_id = ${reviewerId})
      AND NOT EXISTS (SELECT 1 FROM required WHERE area_id IS NULL)
      ${requireAll ? sql`AND NOT EXISTS (SELECT 1 FROM required r WHERE NOT EXISTS (SELECT 1 FROM covered c WHERE c.area_id = r.area_id))` : sql``}
  )`;
}

export async function getScopedPendingRequests(
  db: Database,
  viewerId: string,
  { after, limit = REVIEW_QUEUE_PAGE_SIZE }: ReviewQueueOptions = {},
): Promise<RequestScope[]> {
  type Row = Omit<ChangeRequest, "requestedAt" | "reviewedAt"> & {
    requestedAt: number;
    reviewedAt: number | null;
    sourceAreaId: number;
    destinationAreaId: number | null;
  };
  const rows = await db.all<Row>(sql`
    WITH RECURSIVE managed(id) AS (
      SELECT area_id FROM admin_area_scopes WHERE user_id = ${viewerId}
      UNION
      SELECT a.id FROM areas a JOIN managed ON a.parent_id = managed.id
    ), scoped AS (
      SELECT r.*,
        CASE WHEN r.type LIKE 'area_%' THEN a.id ELSE c.area_id END AS source_area_id,
        CASE WHEN r.type = 'climb_merge' THEN target.area_id ELSE destination.id END AS destination_area_id
      FROM change_requests r
      LEFT JOIN areas a ON r.type LIKE 'area_%' AND a.id = r.entity_id
      LEFT JOIN climbs c ON r.type LIKE 'climb_%' AND c.id = r.entity_id
      LEFT JOIN areas destination ON destination.id = CASE r.type
        WHEN 'area_reparent' THEN json_extract(r.payload, '$.newParentId')
        WHEN 'climb_move' THEN json_extract(r.payload, '$.newAreaId') END
      LEFT JOIN climbs target ON r.type = 'climb_merge' AND target.id = json_extract(r.payload, '$.targetClimbId')
      WHERE r.status = 'pending' AND r.requested_by IS NOT ${viewerId}
    )
    SELECT id, type, entity_id AS entityId, payload, requested_by AS requestedBy,
      requested_at AS requestedAt, status, reviewed_by AS reviewedBy, reviewed_at AS reviewedAt,
      review_note AS reviewNote, source_area_id AS sourceAreaId, destination_area_id AS destinationAreaId
    FROM scoped
    WHERE source_area_id IS NOT NULL
      AND (type NOT IN ('area_reparent', 'climb_move', 'climb_merge') OR destination_area_id IS NOT NULL)
      AND (source_area_id IN (SELECT id FROM managed) OR destination_area_id IN (SELECT id FROM managed))
      ${after ? sql`AND (requested_at, id) > (${after.requestedAt}, ${after.id})` : sql``}
    ORDER BY requested_at, id
    LIMIT ${Math.min(Math.max(limit, 1), REVIEW_QUEUE_PAGE_SIZE + 1)}
  `);
  return rows.map(({ sourceAreaId, destinationAreaId, ...row }) => ({
    request: {
      ...row,
      requestedAt: new Date(row.requestedAt),
      reviewedAt: row.reviewedAt === null ? null : new Date(row.reviewedAt),
    },
    scopeAreaIds: [
      ...new Set(destinationAreaId === null ? [sourceAreaId] : [sourceAreaId, destinationAreaId]),
    ],
  }));
}

/** Load entity facts once for all descriptions on a page, including current parents. */
export async function getModerationFacts(db: Database, requests: ChangeRequest[]) {
  const climbIds = new Set<number>();
  const areaIds = new Set<number>();
  for (const request of requests) {
    (request.type.startsWith("area_") ? areaIds : climbIds).add(request.entityId);
    const payload = JSON.parse(request.payload);
    if (request.type === "climb_merge") climbIds.add(payload.targetClimbId);
    if (request.type === "climb_move") areaIds.add(payload.newAreaId);
    if (request.type === "area_reparent") areaIds.add(payload.newParentId);
  }
  const climbRows = climbIds.size
    ? await db
        .select()
        .from(climbs)
        .where(sql`${climbs.id} IN (SELECT value FROM json_each(${JSON.stringify([...climbIds])}))`)
    : [];
  for (const climb of climbRows) areaIds.add(climb.areaId);
  const ids = JSON.stringify([...areaIds]);
  const areaRows = areaIds.size
    ? await db.select().from(areas).where(sql`${areas.id} IN (
    SELECT value FROM json_each(${ids})
    UNION SELECT parent_id FROM areas WHERE id IN (SELECT value FROM json_each(${ids}))
  )`)
    : [];
  return {
    areas: new Map(areaRows.map((area) => [area.id, area])),
    climbs: new Map(climbRows.map((climb) => [climb.id, climb])),
  };
}

export type ModerationFacts = Awaited<ReturnType<typeof getModerationFacts>>;

export async function getApprovalCoverageRows(db: Database, requests: RequestScope[]) {
  if (requests.length === 0) return [];
  return db.all<{
    requestId: number;
    userId: string;
    name: string;
    image: string | null;
    areaId: number;
    covered: number;
  }>(sql`
    WITH RECURSIVE requested(request_id, area_id) AS (
      SELECT json_extract(r.value, '$.id'), a.value
      FROM json_each(${JSON.stringify(requests.map(({ request, scopeAreaIds }) => ({ id: request.id, areas: scopeAreaIds })))}) r,
        json_each(json_extract(r.value, '$.areas')) a
    ), ancestors(area_id, ancestor_id) AS (
      SELECT DISTINCT area_id, area_id FROM requested
      UNION
      SELECT ancestors.area_id, areas.parent_id FROM ancestors
      JOIN areas ON areas.id = ancestors.ancestor_id WHERE areas.parent_id IS NOT NULL
    )
    SELECT r.request_id AS requestId, u.id AS userId, u.name, u.image, r.area_id AS areaId,
      (u.role = 'admin' AND EXISTS (
        SELECT 1 FROM admin_area_scopes s JOIN ancestors a ON a.ancestor_id = s.area_id
        WHERE s.user_id = u.id AND a.area_id = r.area_id
      )) AS covered
    FROM requested r
    JOIN change_request_approvals approval ON approval.request_id = r.request_id
    JOIN user u ON u.id = approval.user_id
    ORDER BY approval.created_at, approval.user_id
  `);
}

/** The areas an admin was granted directly (each grant covers its whole
 * subtree — see isAdminForArea in lib/moderation.ts). Just the granted rows,
 * not the expanded tree: this feeds the "areas you moderate" line on the
 * review queue. */
export async function getManagedAreas(db: Database, userId: string): Promise<Area[]> {
  const rows = await db
    .select({ area: areas })
    .from(adminAreaScopes)
    .innerJoin(areas, eq(areas.id, adminAreaScopes.areaId))
    .where(eq(adminAreaScopes.userId, userId))
    .orderBy(areas.name)
    .all();
  return rows.map((row) => row.area);
}

export async function getChangeRequest(
  db: Database,
  id: number,
): Promise<ChangeRequest | undefined> {
  return db.select().from(changeRequests).where(eq(changeRequests.id, id)).get();
}
