//! Stable RPC names used by the Worker dispatcher and the native OpenAPI exporter.
macro_rules! rpc_names {
    ($($action:ident => $name:literal),+ $(,)?) => {
        #[derive(Clone, Copy, PartialEq, Eq)]
        pub(crate) enum Action { $($action),+ }
        impl Action {
            pub fn parse(name: &str) -> Option<Self> {
                match name { $($name => Some(Self::$action),)+ _ => None }
            }
            #[cfg(feature="api-spec")]
            pub const ALL: &[Self] = &[$(Self::$action),+];
            #[cfg(feature="api-spec")]
            pub fn name(self) -> &'static str {
                match self { $(Self::$action => $name,)+ }
            }
        }
    }
}

rpc_names! {
    AcceptFriendRequest => "acceptFriendRequest",
    AcceptTerms => "acceptTerms",
    AcknowledgeGoalAchievements => "acknowledgeGoalAchievements",
    AddClimbToList => "addClimbToList",
    ApproveChangeRequest => "approveChangeRequest",
    ArchiveGoal => "archiveGoal",
    CancelFriendRequest => "cancelFriendRequest",
    CopyClimbList => "copyClimbList",
    CreateArea => "createArea",
    CreateClimb => "createClimb",
    CreateClimbList => "createClimbList",
    CreateJournalEntry => "createJournalEntry",
    CreateUndatedSend => "createUndatedSend",
    DeclineFriendRequest => "declineFriendRequest",
    DeleteClimbList => "deleteClimbList",
    DeleteGoal => "deleteGoal",
    DeleteJournalEntry => "deleteJournalEntry",
    DeletePushSubscription => "deletePushSubscription",
    DeleteSend => "deleteSend",
    DeleteTrip => "deleteTrip",
    DismissFeatureAnnouncement => "dismissFeatureAnnouncement",
    GetSendEditorData => "getSendEditorData",
    ImportSends => "importSends",
    MarkNotificationsRead => "markNotificationsRead",
    PinProject => "pinProject",
    RejectChangeRequest => "rejectChangeRequest",
    RemoveFriendship => "removeFriendship",
    RemoveMyJournalTag => "removeMyJournalTag",
    RemoveMyTripTag => "removeMyTripTag",
    RemoveProfilePhoto => "removeProfilePhoto",
    RequestAreaDelete => "requestAreaDelete",
    RequestAreaEdit => "requestAreaEdit",
    RequestAreaReparent => "requestAreaReparent",
    RequestClimbBreak => "requestClimbBreak",
    RequestClimbDelete => "requestClimbDelete",
    RequestClimbEdit => "requestClimbEdit",
    RequestClimbMerge => "requestClimbMerge",
    RequestClimbMove => "requestClimbMove",
    RequestFriendship => "requestFriendship",
    ResetProfileShareLink => "resetProfileShareLink",
    ResolveImportClimbs => "resolveImportClimbs",
    ResolveImportClimbsInAreas => "resolveImportClimbsInAreas",
    SaveAnalyticsLayout => "saveAnalyticsLayout",
    SaveClimbListEdits => "saveClimbListEdits",
    SaveGoal => "saveGoal",
    SaveProductTourStatus => "saveProductTourStatus",
    SavePushSubscription => "savePushSubscription",
    SaveTrip => "saveTrip",
    SaveTripNotes => "saveTripNotes",
    SetClimbListVisibility => "setClimbListVisibility",
    SetGradePreferences => "setGradePreferences",
    SetJournalVisibility => "setJournalVisibility",
    SetSendAlertPreferences => "setSendAlertPreferences",
    SetSendCommentVisibility => "setSendCommentVisibility",
    SetTripVisibility => "setTripVisibility",
    SetUserPrivate => "setUserPrivate",
    ShareClimbList => "shareClimbList",
    ShareProject => "shareProject",
    ShareTrip => "shareTrip",
    SubmitContactMessage => "submitContactMessage",
    UnpinProject => "unpinProject",
    UnshareClimbList => "unshareClimbList",
    UnshareProject => "unshareProject",
    UnshareTrip => "unshareTrip",
    UpdateArea => "updateArea",
    UpdateClimb => "updateClimb",
    UpdateClimbList => "updateClimbList",
    UpdateDisplayName => "updateDisplayName",
    UpdateJournalEntry => "updateJournalEntry",
    UpdateSend => "updateSend",
    UploadProfilePhoto => "uploadProfilePhoto",
}
