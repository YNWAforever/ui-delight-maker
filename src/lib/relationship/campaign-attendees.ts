/**
 * How an imported attendee's data quality is described on screen.
 *
 * §9.11 requires the attendee list to state its match state explicitly, including the two
 * bad ones. That is a product rule, not a rendering detail, so it lives here as a pure
 * function the route and its tests share rather than as a ternary inside a table cell.
 *
 * Two things it deliberately refuses to do.
 *
 * It never reports "matched" for a row that merely carries a company name. `raw_company_name`
 * is the text off the CSV; `account_id` is the account the import actually resolved. The
 * old table printed the raw name as the company and put "Awaiting account match" underneath
 * in muted 12px, so an unmatched row and a matched row read as the same row with a slightly
 * different subtitle. An attendee with no account cannot be followed up through the account,
 * cannot be counted in coverage, and is the single most common thing wrong with an imported
 * roster — so it gets the word "Unmatched".
 *
 * And it does not compute duplicates from what happens to be on screen. `duplicateCount`
 * comes from a window over every member of the campaign (see `ATTENDEE_DEDUPE_KEY_SQL` in
 * the campaigns repository), because `commitEventImport` inserts unconditionally: the
 * failure this state exists to expose is re-uploading the same file, and the second copy of
 * a row usually lands on a different page from the first.
 */
export type AttendeeMatchState = "matched" | "unmatched";

export type AttendeeDataQuality = {
  match: AttendeeMatchState;
  /** Rendered as its own marker, additionally to the match state. */
  possibleDuplicate: boolean;
  /** The words shown for the match state. Never colour alone. */
  matchLabel: string;
  /** One sentence saying what is wrong, or what the match resolved to. */
  matchDescription: string;
};

export type AttendeeQualityInput = {
  account_id?: string | null;
  contact_id?: string | null;
  /** Campaign-wide size of this row's dedupe group. Absent or 1 means "not comparable". */
  duplicate_count?: number | string | null;
};

/** True when this row shares its dedupe key with at least one other attendee. */
export function isPossibleDuplicateAttendee(attendee: AttendeeQualityInput): boolean {
  const count = Number(attendee.duplicate_count ?? 1);
  return Number.isFinite(count) && count > 1;
}

export function describeAttendeeQuality(attendee: AttendeeQualityInput): AttendeeDataQuality {
  const possibleDuplicate = isPossibleDuplicateAttendee(attendee);

  if (!attendee.account_id) {
    return {
      match: "unmatched",
      possibleDuplicate,
      matchLabel: "Unmatched",
      matchDescription:
        "No account was matched, so this attendee is not counted in any account's coverage.",
    };
  }

  return {
    match: "matched",
    possibleDuplicate,
    matchLabel: "Matched",
    // A matched account with no contact is still a partial match, and saying so is the
    // difference between "this is done" and "this needs a contact record".
    matchDescription: attendee.contact_id
      ? "Linked to an account and a contact."
      : "Linked to an account, but no contact record was matched or created.",
  };
}

/**
 * The attendees that need a human, most severe first.
 *
 * Order is the product decision `AttentionQueue` refuses to make for its caller: an
 * attendee nobody can act on (no account) outranks one that is merely a suspected repeat,
 * which outranks one that is simply waiting for its follow-up task. Within a severity the
 * caller's order is preserved, which is the newest-first order the attendee read returns.
 */
export type AttendeeAttentionKind = "unmatched" | "duplicate" | "follow_up";

const OPEN_FOLLOW_UP_STATUSES = new Set(["not_started", "in_progress"]);

export function classifyAttendeeAttention(
  attendee: AttendeeQualityInput & { follow_up_status?: string | null },
): AttendeeAttentionKind | null {
  if (!attendee.account_id) return "unmatched";
  if (isPossibleDuplicateAttendee(attendee)) return "duplicate";
  if (attendee.follow_up_status && OPEN_FOLLOW_UP_STATUSES.has(attendee.follow_up_status)) {
    return "follow_up";
  }
  return null;
}

const ATTENTION_RANK: Record<AttendeeAttentionKind, number> = {
  unmatched: 0,
  duplicate: 1,
  follow_up: 2,
};

export function rankAttendeeAttention(kind: AttendeeAttentionKind): number {
  return ATTENTION_RANK[kind];
}
