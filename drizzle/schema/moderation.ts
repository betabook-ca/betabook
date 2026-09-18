import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { areas } from "./areas";
import { user } from "./auth";

// entityId targets areas or climbs according to type, so it cannot have a
// single foreign key. Audit records also survive entity deletion.
export const CHANGE_REQUEST_TYPES = [
  "area_edit",
  "area_delete",
  "area_reparent",
  "area_merge",
  "climb_edit",
  "climb_delete",
  "climb_move",
  "climb_merge",
  "climb_break",
] as const;

export const changeRequests = sqliteTable(
  "change_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: CHANGE_REQUEST_TYPES }).notNull(),
    entityId: integer("entity_id").notNull(),
    // Changed fields and any discipline context needed to interpret them.
    // Application revalidates grades and current entity constraints.
    payload: text("payload").notNull(),
    // Decided requests survive account deletion with a null requester; pending
    // requests are removed by account cleanup.
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    reviewNote: text("review_note"),
  },
  (t) => [
    index("change_requests_status_idx").on(t.status),
    index("change_requests_entity_idx").on(t.type, t.entityId),
    // Avoid scanning all requests when enforcing the requester FK on account deletion.
    index("change_requests_requested_by_idx").on(t.requestedBy),
    // Account cleanup removes pending requests before nulling requestedBy;
    // otherwise SQLite's distinct NULLs would bypass this uniqueness rule.
    uniqueIndex("change_requests_pending_unique")
      .on(t.type, t.entityId, t.requestedBy)
      .where(sql`status = 'pending'`),
  ],
);

// Each grant covers its area and descendants. Grants are assigned outside the UI.
export const adminAreaScopes = sqliteTable(
  "admin_area_scopes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    areaId: integer("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.areaId] }),
    index("admin_area_scopes_area_idx").on(t.areaId),
  ],
);

// Store votes separately from the final decision. Application recomputes
// coverage against current roles and grants, including the requester's implicit vote.
export const changeRequestApprovals = sqliteTable(
  "change_request_approvals",
  {
    requestId: integer("request_id")
      .notNull()
      .references(() => changeRequests.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.userId] })],
);
