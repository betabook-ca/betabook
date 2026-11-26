import type { ActionArgs, ActionName, ClientResult } from "./action-contracts";
export type {
  SavedClimbList,
  ReviewDecision,
  ClimbListItemChange,
  ImportResult,
} from "./action-contracts";
import { GENERIC_ERROR_MESSAGE } from "@/lib/action-result";

const READ_ONLY_ACTIONS = new Set([
  "getSendEditorData",
  "submitContactMessage",
  "resolveImportClimbs",
  "resolveImportClimbsInAreas",
]);

const SESSION_REFRESH_ACTIONS = new Set([
  "acceptTerms",
  "removeProfilePhoto",
  "setGradePreferences",
  "updateDisplayName",
  "uploadProfilePhoto",
]);

function serializeArg(arg: unknown): unknown {
  if (arg instanceof FormData) {
    const entries: [string, string][] = [];
    for (const [key, value] of arg.entries()) {
      if (typeof value === "string") {
        entries.push([key, value]);
      }
    }
    return { __formData: entries };
  }
  return arg;
}

async function callAction<N extends ActionName>(
  name: N,
  args: ActionArgs<N>,
): Promise<ClientResult<N>> {
  try {
    const photo = name === "uploadProfilePhoto" && args[0] instanceof FormData ? args[0] : null;
    const response = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: "POST",
      credentials: "same-origin",
      ...(photo
        ? { body: photo }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ args: args.map(serializeArg) }),
          }),
    });
    const text = await response.text();
    if (name === "importSends" && (!response.ok || !text))
      throw new Error("Unconfirmed import result");
    const result: { ok: boolean; value?: unknown; error?: string } = text
      ? JSON.parse(text)
      : response.ok
        ? { ok: true, value: undefined }
        : { ok: false, error: GENERIC_ERROR_MESSAGE };

    if (!result || typeof result.ok !== "boolean") throw new Error("Invalid action result");
    if (result.ok && !READ_ONLY_ACTIONS.has(name)) {
      window.dispatchEvent(new CustomEvent("betabook:router-refresh"));
      if (SESSION_REFRESH_ACTIONS.has(name)) {
        window.dispatchEvent(new CustomEvent("betabook:session-refresh"));
      }
    }
    return (result.ok ? { ...result, value: result.value } : result) as ClientResult<N>;
  } catch {
    return {
      ok: false,
      error: GENERIC_ERROR_MESSAGE,
      ...(name === "importSends" && { outcome: "unknown" }),
    } as ClientResult<N>;
  }
}

function actionProxy<K extends ActionName>(name: K) {
  return (...args: ActionArgs<K>) => callAction(name, args);
}

export const acceptTerms = actionProxy("acceptTerms");
export const acceptFriendRequest = actionProxy("acceptFriendRequest");
export const acknowledgeGoalAchievements = actionProxy("acknowledgeGoalAchievements");
export const addClimbToList = actionProxy("addClimbToList");
export const approveChangeRequest = actionProxy("approveChangeRequest");
export const archiveGoal = actionProxy("archiveGoal");
export const cancelFriendRequest = actionProxy("cancelFriendRequest");
export const copyClimbList = actionProxy("copyClimbList");
export const createArea = actionProxy("createArea");
export const createClimb = actionProxy("createClimb");
export const createClimbList = actionProxy("createClimbList");
export const createJournalEntry = actionProxy("createJournalEntry");
export const createUndatedSend = actionProxy("createUndatedSend");
export const declineFriendRequest = actionProxy("declineFriendRequest");
export const deleteClimbList = actionProxy("deleteClimbList");
export const deleteGoal = actionProxy("deleteGoal");
export const deleteJournalEntry = actionProxy("deleteJournalEntry");
export const deleteSend = actionProxy("deleteSend");
export const deleteTrip = actionProxy("deleteTrip");
export const dismissFeatureAnnouncement = actionProxy("dismissFeatureAnnouncement");
export const getSendEditorData = actionProxy("getSendEditorData");
export const importSends = actionProxy("importSends");
export const pinProject = actionProxy("pinProject");
export const rejectChangeRequest = actionProxy("rejectChangeRequest");
export const removeFriendship = actionProxy("removeFriendship");
export const removeMyJournalTag = actionProxy("removeMyJournalTag");
export const removeMyTripTag = actionProxy("removeMyTripTag");
export const removeProfilePhoto = actionProxy("removeProfilePhoto");
export const requestAreaDelete = actionProxy("requestAreaDelete");
export const requestAreaEdit = actionProxy("requestAreaEdit");
export const requestAreaReparent = actionProxy("requestAreaReparent");
export const requestClimbBreak = actionProxy("requestClimbBreak");
export const requestClimbDelete = actionProxy("requestClimbDelete");
export const requestClimbEdit = actionProxy("requestClimbEdit");
export const requestClimbMerge = actionProxy("requestClimbMerge");
export const requestClimbMove = actionProxy("requestClimbMove");
export const requestFriendship = actionProxy("requestFriendship");
export const resetProfileShareLink = actionProxy("resetProfileShareLink");
export const resolveImportClimbs = actionProxy("resolveImportClimbs");
export const resolveImportClimbsInAreas = actionProxy("resolveImportClimbsInAreas");
export const saveAnalyticsLayout = actionProxy("saveAnalyticsLayout");
export const saveClimbListEdits = actionProxy("saveClimbListEdits");
export const saveGoal = actionProxy("saveGoal");
export const saveProductTourStatus = actionProxy("saveProductTourStatus");
export const saveTrip = actionProxy("saveTrip");
export const saveTripNotes = actionProxy("saveTripNotes");
export const setClimbListVisibility = actionProxy("setClimbListVisibility");
export const setGradePreferences = actionProxy("setGradePreferences");
export const setJournalVisibility = actionProxy("setJournalVisibility");
export const setSendCommentVisibility = actionProxy("setSendCommentVisibility");
export const setTripVisibility = actionProxy("setTripVisibility");
export const setUserPrivate = actionProxy("setUserPrivate");
export const shareClimbList = actionProxy("shareClimbList");
export const shareProject = actionProxy("shareProject");
export const shareTrip = actionProxy("shareTrip");
export const unpinProject = actionProxy("unpinProject");
export const unshareClimbList = actionProxy("unshareClimbList");
export const unshareProject = actionProxy("unshareProject");
export const unshareTrip = actionProxy("unshareTrip");
export const updateArea = actionProxy("updateArea");
export const updateClimb = actionProxy("updateClimb");
export const updateClimbList = actionProxy("updateClimbList");
export const updateDisplayName = actionProxy("updateDisplayName");
export const updateJournalEntry = actionProxy("updateJournalEntry");
export const updateSend = actionProxy("updateSend");
export const uploadProfilePhoto = actionProxy("uploadProfilePhoto");

export const submitContact = actionProxy("submitContactMessage");
