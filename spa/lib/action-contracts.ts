import type { ClimbCandidate, EditableSend, JournalEntry, SendableClimb } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import type { AnalyticsLayout } from "@/lib/analytics-layout";
import type { FriendshipStatus } from "@/lib/friendships";
import type { ImportBatchResponse } from "@/lib/import-execution";
import type { GatedActionResult } from "@/lib/moderation";
import type { ImportOptions, ImportSendRow } from "@/lib/sends";

export type ReviewDecision = { decision: "applied" | "awaiting" };
export type ClimbListItemChange = { changed: boolean; climbCount: number };
export type SavedClimbList = { id: number; title: string };
type CopySource = { listId: number } | { token: string };

export interface ClientActions {
  acceptFriendRequest(targetId: string): Promise<ActionResult<FriendshipStatus>>;
  acceptTerms(version: unknown, agreed: unknown): Promise<ActionResult>;
  acknowledgeGoalAchievements(raw: unknown): Promise<ActionResult>;
  addClimbToList(listId: number, climbId: number): Promise<ActionResult<ClimbListItemChange>>;
  approveChangeRequest(requestId: number): Promise<ActionResult<ReviewDecision>>;
  archiveGoal(id: number): Promise<ActionResult>;
  cancelFriendRequest(targetId: string): Promise<ActionResult<FriendshipStatus>>;
  copyClimbList(source: CopySource, raw: unknown): Promise<ActionResult<SavedClimbList>>;
  createArea(parentId: number, formData: FormData): Promise<ActionResult<number>>;
  createClimb(areaId: number, formData: FormData): Promise<ActionResult<number>>;
  createClimbList(
    raw: unknown,
    options?: {
      climbId?: number;
    },
  ): Promise<ActionResult<SavedClimbList>>;
  createJournalEntry(formData: FormData): Promise<ActionResult>;
  createUndatedSend(formData: FormData): Promise<ActionResult>;
  declineFriendRequest(targetId: string): Promise<ActionResult<FriendshipStatus>>;
  deleteClimbList(listId: number): Promise<ActionResult>;
  deleteGoal(id: number): Promise<ActionResult>;
  deleteJournalEntry(entryId: number): Promise<ActionResult>;
  deleteSend(sendId: number): Promise<ActionResult>;
  deleteTrip(tripId: number): Promise<ActionResult>;
  dismissFeatureAnnouncement(featureId: string): Promise<ActionResult>;
  getSendEditorData(
    target:
      | {
          sendId: number;
        }
      | {
          entryId: number;
        },
  ): Promise<
    ActionResult<{
      send: EditableSend;
      entry: JournalEntry | null;
      climb: SendableClimb;
    }>
  >;
  importSends(rows: ImportSendRow[], options: ImportOptions): Promise<ImportBatchResponse>;
  pinProject(climbId: number): Promise<ActionResult>;
  rejectChangeRequest(requestId: number, note: unknown): Promise<ActionResult>;
  removeFriendship(targetId: string): Promise<ActionResult<FriendshipStatus>>;
  removeMyJournalTag(entryId: number): Promise<ActionResult>;
  removeMyTripTag(tripId: number): Promise<ActionResult>;
  removeProfilePhoto(): Promise<ActionResult>;
  requestAreaDelete(areaId: number): Promise<ActionResult<GatedActionResult>>;
  requestAreaEdit(areaId: number, formData: FormData): Promise<ActionResult<GatedActionResult>>;
  requestAreaReparent(
    areaId: number,
    newParentId: number,
  ): Promise<ActionResult<GatedActionResult>>;
  requestClimbBreak(climbId: number, formData: FormData): Promise<ActionResult<GatedActionResult>>;
  requestClimbDelete(climbId: number): Promise<ActionResult<GatedActionResult>>;
  requestClimbEdit(climbId: number, formData: FormData): Promise<ActionResult<GatedActionResult>>;
  requestClimbMerge(
    sourceClimbId: number,
    targetClimbId: number,
    overrides?: unknown,
  ): Promise<ActionResult<GatedActionResult>>;
  requestClimbMove(climbId: number, newAreaId: number): Promise<ActionResult<GatedActionResult>>;
  requestFriendship(targetId: string): Promise<ActionResult<FriendshipStatus>>;
  resetProfileShareLink(): Promise<ActionResult>;
  resolveImportClimbs(names: string[]): Promise<ActionResult<ClimbCandidate[]>>;
  resolveImportClimbsInAreas(
    pairs: {
      name: string;
      areaName: string;
    }[],
  ): Promise<ActionResult<ClimbCandidate[]>>;
  saveAnalyticsLayout(layout: AnalyticsLayout): Promise<ActionResult>;
  saveClimbListEdits(listId: number, climbIds: unknown): Promise<ActionResult>;
  saveGoal(id: number | null, raw: unknown, retryOf?: number): Promise<ActionResult<number>>;
  saveProductTourStatus(id: string, version: number, status: string): Promise<ActionResult>;
  saveTrip(tripId: number | null, raw: unknown): Promise<ActionResult<number>>;
  saveTripNotes(tripId: number, raw: unknown): Promise<ActionResult>;
  setClimbListVisibility(visibility: string): Promise<ActionResult>;
  setGradePreferences(scales: { boulder: string; rope: string }): Promise<ActionResult>;
  setJournalVisibility(visibility: string): Promise<ActionResult>;
  setSendCommentVisibility(visibility: string): Promise<ActionResult>;
  setTripVisibility(visibility: string): Promise<ActionResult>;
  setUserPrivate(isPrivate: boolean): Promise<ActionResult>;
  shareClimbList(
    listId: number,
    expiry: unknown,
  ): Promise<
    ActionResult<{
      token: string;
      expiresAt: string | null;
    }>
  >;
  shareProject(
    climbId: number,
    expiry: unknown,
  ): Promise<
    ActionResult<{
      token: string;
      expiresAt: string | null;
    }>
  >;
  shareTrip(
    tripId: number,
    expiry: unknown,
  ): Promise<
    ActionResult<{
      token: string;
      expiresAt: string | null;
    }>
  >;
  unpinProject(climbId: number): Promise<ActionResult>;
  unshareClimbList(listId: number): Promise<ActionResult>;
  unshareProject(climbId: number): Promise<ActionResult>;
  unshareTrip(tripId: number): Promise<ActionResult>;
  updateArea(areaId: number, formData: FormData): Promise<ActionResult>;
  updateClimb(climbId: number, formData: FormData): Promise<ActionResult>;
  updateClimbList(listId: number, raw: unknown): Promise<ActionResult>;
  updateDisplayName(formData: FormData): Promise<ActionResult>;
  updateJournalEntry(entryId: number, formData: FormData): Promise<ActionResult>;
  updateSend(sendId: number, formData: FormData): Promise<ActionResult>;
  uploadProfilePhoto(formData: FormData): Promise<ActionResult>;
}
