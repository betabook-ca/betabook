import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";

async function callAction(name: string, ...args: unknown[]): Promise<ActionResult<never>> {
  try {
    const isFormData = args.length === 1 && args[0] instanceof FormData;
    const response = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: "POST",
      credentials: "same-origin",
      ...(isFormData
        ? { body: args[0] as FormData }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ args }),
          }),
    });
    const text = await response.text();
    if (text) {
      return JSON.parse(text) as ActionResult<never>;
    }
    return response.ok
      ? ({ ok: true, value: undefined } as ActionResult<never>)
      : { ok: false, error: GENERIC_ERROR_MESSAGE };
  } catch {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}

function actionProxy(name: string) {
  return (...args: unknown[]) => callAction(name, ...args);
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
export const getSentJournalEntries = actionProxy("getSentJournalEntries");
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
export const saveJournalBatch = actionProxy("saveJournalBatch");
export const saveProductTourStatus = actionProxy("saveProductTourStatus");
export const saveTrip = actionProxy("saveTrip");
export const saveTripBatch = actionProxy("saveTripBatch");
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
