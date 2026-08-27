import { describe, expect, it } from "vitest";

import {
  classifyAttendeeAttention,
  describeAttendeeQuality,
  isPossibleDuplicateAttendee,
  rankAttendeeAttention,
} from "../relationship/campaign-attendees";

/**
 * The data-quality rules §9.11 requires the attendee list to state out loud.
 *
 * These are product rules, not rendering: "this attendee resolved to no account" and "this
 * attendee looks like a second copy of another one" decide what a person does next, and
 * both used to be either invisible or expressed as muted subtext.
 */
describe("describeAttendeeQuality", () => {
  it("calls an attendee with no account Unmatched, whatever the CSV said the company was", () => {
    // The row that made this necessary: a company name off the file, no resolved account.
    // The old cell printed the company name in medium weight and read as a finished row.
    const quality = describeAttendeeQuality({ account_id: null, contact_id: null });

    expect(quality.match).toBe("unmatched");
    expect(quality.matchLabel).toBe("Unmatched");
    expect(quality.matchDescription).toMatch(/no account/i);
  });

  it("separates a full match from an account-only match", () => {
    expect(
      describeAttendeeQuality({ account_id: "a1", contact_id: "c1" }).matchDescription,
    ).toMatch(/account and a contact/i);
    expect(
      describeAttendeeQuality({ account_id: "a1", contact_id: null }).matchDescription,
    ).toMatch(/no contact record/i);
    expect(describeAttendeeQuality({ account_id: "a1", contact_id: null }).match).toBe("matched");
  });

  it("marks a duplicate independently of whether the account matched", () => {
    expect(
      describeAttendeeQuality({ account_id: "a1", contact_id: "c1", duplicate_count: 2 })
        .possibleDuplicate,
    ).toBe(true);
    expect(
      describeAttendeeQuality({ account_id: null, contact_id: null, duplicate_count: 3 })
        .possibleDuplicate,
    ).toBe(true);
  });
});

describe("isPossibleDuplicateAttendee", () => {
  it("needs a group larger than one", () => {
    expect(isPossibleDuplicateAttendee({ duplicate_count: 2 })).toBe(true);
    expect(isPossibleDuplicateAttendee({ duplicate_count: 1 })).toBe(false);
  });

  it("reads the count Postgres actually sends", () => {
    // node-postgres returns bigint aggregates as strings; a bare `> 1` on "2" is a string
    // comparison and happens to be right, on "10" it is wrong.
    expect(isPossibleDuplicateAttendee({ duplicate_count: "2" })).toBe(true);
    expect(isPossibleDuplicateAttendee({ duplicate_count: "10" })).toBe(true);
    expect(isPossibleDuplicateAttendee({ duplicate_count: "1" })).toBe(false);
  });

  it("never guesses when the column is absent or unusable", () => {
    // A read that does not project the window column must not turn every row red.
    expect(isPossibleDuplicateAttendee({})).toBe(false);
    expect(isPossibleDuplicateAttendee({ duplicate_count: null })).toBe(false);
    expect(isPossibleDuplicateAttendee({ duplicate_count: "not a number" })).toBe(false);
  });
});

describe("classifyAttendeeAttention", () => {
  it("puts an unmatched attendee in the queue regardless of follow-up state", () => {
    expect(classifyAttendeeAttention({ account_id: null, follow_up_status: "completed" })).toBe(
      "unmatched",
    );
  });

  it("queues a matched attendee only while nobody has picked it up", () => {
    expect(classifyAttendeeAttention({ account_id: "a1", follow_up_status: "not_started" })).toBe(
      "follow_up",
    );
    expect(classifyAttendeeAttention({ account_id: "a1", follow_up_status: "in_progress" })).toBe(
      "follow_up",
    );
    // A task exists, so the row is moving. Listing it again is the queue crying wolf.
    expect(classifyAttendeeAttention({ account_id: "a1", follow_up_status: "task_created" })).toBe(
      null,
    );
    expect(classifyAttendeeAttention({ account_id: "a1", follow_up_status: "completed" })).toBe(
      null,
    );
    expect(classifyAttendeeAttention({ account_id: "a1", follow_up_status: "dismissed" })).toBe(
      null,
    );
  });

  it("ranks unmatched above everything else", () => {
    // AttentionQueue renders the order it is given and never sorts, so the ordering rule
    // has to be true here or it is true nowhere.
    expect(rankAttendeeAttention("unmatched")).toBeLessThan(rankAttendeeAttention("duplicate"));
    expect(rankAttendeeAttention("duplicate")).toBeLessThan(rankAttendeeAttention("follow_up"));
  });
});
