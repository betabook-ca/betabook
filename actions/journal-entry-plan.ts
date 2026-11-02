import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/db/client";
import { getClimb, getUserSendForClimb, type Climb } from "@/db/queries";
import { journalEntries } from "@/db/schema";
import { ActionError, JOURNAL_RATE_LIMIT_MESSAGE } from "@/lib/action-result";
import { assertLoggableOnClimb } from "@/lib/broken-climbs";
import type { JournalEntryInput } from "@/lib/journal";
import { allowJournalWrite } from "@/lib/rate-limit";
import { readVideoFields, validateSendInput, type RawSendInput } from "@/lib/sends";
import { requireSession } from "@/lib/session";
import { pickFormFields } from "@/lib/validation";

import { buildCompanionInsert } from "./journal-companion-statements";
import {
  assertRepeatDate,
  buildSentJournalInsert,
  getSentJournalEntries,
  journalEntryFromSend,
  REPEAT_BEFORE_ASCENT_MESSAGE,
} from "./journal-sync";
import { buildMirroredSendUpdate, buildSendInsert } from "./send-statements";

const JOURNAL_FORM_FIELDS = ["kind", "climbId", "sent", "entryDate", "body"] as const;

const SEND_FORM_FIELDS = ["ascentStyle", "rating", "suggestedGrade", "gradeFeel"] as const;

export const SESSION_SEND_FIELDS_MESSAGE = "A session doesn't carry a rating or a grade";

export const SEND_CHANGED_MESSAGE = "The send changed while this entry was being saved — try again";

export function readJournalFormData(formData: FormData) {
  return { ...pickFormFields(formData, JOURNAL_FORM_FIELDS), tags: formData.getAll("tag") };
}

function readSendFormData(
  formData: FormData,
  entryDate: string,
  comment: string | null,
): RawSendInput {
  return {
    ...pickFormFields(formData, SEND_FORM_FIELDS),
    dateSent: entryDate,
    comment,
    videos: readVideoFields(formData),
  };
}

/** Whether the form carries anything only a new ascent can hold — its
 * opinion fields or a video. */
export function carriesSendFields(formData: FormData): boolean {
  return [...SEND_FORM_FIELDS, "video"].some((field) =>
    formData.getAll(field).some((value) => value !== ""),
  );
}

/** One rate-limit charge per call, however many entries the call saves. */
export async function requireJournalSession() {
  const session = await requireSession();
  if (!(await allowJournalWrite(session.user.id))) {
    throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);
  }
  return session;
}

export async function requireClimb(db: Database, climbId: number) {
  const climb = await getClimb(db, climbId);
  if (!climb) throw new ActionError("Climb not found");
  return climb;
}

export function entryValues(userId: string, input: JournalEntryInput) {
  return {
    userId,
    kind: input.kind,
    climbId: input.climbId,
    sent: input.sent,
    entryDate: input.entryDate,
    body: input.body,
    tags: input.tags,
  };
}

export type ClimbEntryPlan = {
  /** The entry's statements in batch order, its companion insert last. */
  statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
  /** Whether the batch writes the climber's send, so send surfaces need revalidating. */
  writesSend: boolean;
};

/** The statements that log one climb's dated entry: a first ascent with its
 * send, a repeat (recovering an ascent that predates the journal first), or a
 * plain session. Reads the climber's current send state and checks the date
 * against it and the climb's break, but writes nothing. The companion insert
 * reads `last_insert_rowid()`, so a caller keeps these statements together
 * and in order within its batch. */
export async function planClimbEntry(
  db: Database,
  userId: string,
  input: JournalEntryInput,
  climb: Climb,
  formData: FormData,
  companions: string[] | undefined,
): Promise<ClimbEntryPlan> {
  // Sessions and ascents alike must predate a break (triggers in 0044 back this up).
  assertLoggableOnClimb(climb, input.entryDate);
  const tagFriends = companions?.length ? [buildCompanionInsert(db, userId, companions)] : [];
  const entry = { ...entryValues(userId, input), climbId: climb.id };

  if (!input.sent) {
    return {
      statements: [db.insert(journalEntries).values(entry), ...tagFriends],
      writesSend: false,
    };
  }

  const existingSend = await getUserSendForClimb(db, userId, climb.id);
  if (!existingSend) {
    const sendInput = validateSendInput(
      climb.type,
      readSendFormData(formData, input.entryDate, input.body),
    );
    return {
      statements: [
        buildSendInsert(db, { userId, climbId: climb.id, climbType: climb.type, input: sendInput }),
        buildSentJournalInsert(db, { ...entry, isAscent: true }),
        ...tagFriends,
      ],
      writesSend: true,
    };
  }
  if (carriesSendFields(formData)) {
    throw new ActionError("A repeat doesn't carry a rating or a grade");
  }

  const sentEntries = await getSentJournalEntries(db, userId, [climb.id]);
  if (!sentEntries.some((sentEntry) => sentEntry.isAscent) && existingSend.dateSent !== null) {
    const { dateSent, comment } = existingSend;
    if (input.entryDate < dateSent) throw new ActionError(REPEAT_BEFORE_ASCENT_MESSAGE);
    // A dated send can predate the journal rollout. Recover its ascent
    // before the repeat so the original date and note remain authoritative.
    return {
      statements: [
        buildMirroredSendUpdate(db, {
          userId,
          climbId: climb.id,
          sendId: existingSend.id,
          values: { dateSent, comment },
          ascentEntryId: null,
        }),
        buildSentJournalInsert(db, [
          journalEntryFromSend(userId, climb.id, dateSent, comment),
          entry,
        ]),
        ...tagFriends,
      ],
      writesSend: true,
    };
  }
  assertRepeatDate(sentEntries, input.entryDate);
  return { statements: [buildSentJournalInsert(db, entry), ...tagFriends], writesSend: false };
}
