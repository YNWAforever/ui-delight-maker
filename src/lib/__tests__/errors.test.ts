import { describe, expect, it } from "vitest";

import { describeTriggerFailure, toSafeErrorMessage } from "../errors";

/**
 * Real driver and framework output. If any of these survives to a browser, the schema,
 * the SQL or a hostname has leaked.
 */
const UNSAFE_MESSAGES = [
  'column "renewal_date" does not exist',
  'relation "public.job_sheets" does not exist',
  'syntax error at or near "SELECT"',
  'duplicate key value violates unique constraint "quotes_pkey"',
  'null value in column "account_id" of relation "quotes" violates not-null constraint',
  "error: connection to server at ep-cool-frost-123.eu-central-1.aws.neon.tech (10.0.0.1), port 5432 failed",
  "getaddrinfo ENOTFOUND db.example-project.supabase.co",
  "connect ECONNREFUSED 127.0.0.1:5432",
  "SQLSTATE 42703",
  "select id, company_name from accounts where owner_id = $1",
  "TypeError: Cannot read properties of undefined (reading 'map')",
  "at loadAccountWorkspace (C:\\Users\\dev\\ui-delight-maker\\src\\server\\read-models\\accounts.ts:88:11)",
  "Error: fetch failed\n    at node:internal/deps/undici/undici:12345:11",
  "Cannot find module '/var/task/node_modules/pg/lib/index.js'",
  // Postgres server messages that name no table and quote no SQL. They are short and read
  // like English, so every shape check passes them; only the marker list stops them. Two
  // leak a secret outright — the database role, and a table name.
  'password authentication failed for user "clientops_rw"',
  "permission denied for table accounts",
  "Connection terminated unexpectedly",
  "terminating connection due to administrator command",
  "SSL connection has been closed unexpectedly",
  "sorry, too many clients already",
  "canceling statement due to statement timeout",
  'invalid input syntax for type uuid: "abc"',
  "deadlock detected",
];

/** Messages a person wrote deliberately for another person. These must survive. */
const SAFE_MESSAGES = [
  "Agent is required",
  "Client Workspace client ID is required",
  "Invalid Client Workspace section",
  "This quote is locked and cannot be edited.",
  "Select at least one lead before assigning an owner.",
];

describe("toSafeErrorMessage", () => {
  it("never lets driver, network or stack detail reach the user", () => {
    for (const message of UNSAFE_MESSAGES) {
      const safe = toSafeErrorMessage(new Error(message));

      expect(safe, `leaked for: ${message}`).toBe("Something went wrong. Please try again.");
    }
  });

  it("keeps messages that were written for a user", () => {
    for (const message of SAFE_MESSAGES) {
      expect(toSafeErrorMessage(new Error(message))).toBe(message);
    }
  });

  it("rejects anything long enough to be machine output, even if it reads cleanly", () => {
    // Length alone is the single most effective filter and needs no vocabulary: a
    // sentence written for a user is short, and driver output is not.
    const longButInnocuous = "The request could not be completed because ".repeat(6);

    expect(longButInnocuous.length).toBeGreaterThan(140);
    expect(toSafeErrorMessage(new Error(longButInnocuous))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("trusts an explicit status over the message text", () => {
    const forbidden = Object.assign(new Error("relation does not exist"), { status: 403 });
    const missing = Object.assign(new Error("whatever"), { status: 404 });
    const timedOut = Object.assign(new Error("whatever"), { status: 504 });

    expect(toSafeErrorMessage(forbidden)).toBe("You do not have access to this.");
    expect(toSafeErrorMessage(missing)).toBe("That record no longer exists.");
    expect(toSafeErrorMessage(timedOut)).toContain("offline");
  });

  it("words the fallback for what the caller knows about the failure", () => {
    const opaque = new Error("ECONNRESET");

    expect(toSafeErrorMessage(opaque, "offline")).toContain("offline");
    expect(toSafeErrorMessage(opaque, "stale")).toContain("out of date");
    expect(toSafeErrorMessage(opaque, "permission")).toBe("You do not have access to this.");
  });

  it("handles values that are not Errors at all", () => {
    expect(toSafeErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
    expect(toSafeErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(toSafeErrorMessage({ weird: true })).toBe("Something went wrong. Please try again.");
    expect(toSafeErrorMessage("Select a stage first.")).toBe("Select a stage first.");
    expect(toSafeErrorMessage('column "x" does not exist')).toBe(
      "Something went wrong. Please try again.",
    );
  });
});

describe("describeTriggerFailure", () => {
  it("treats an unconnected webhook as a failure, not a success", () => {
    // Six server functions return this sentinel rather than throwing, and three call
    // sites toast success anyway — reporting agent work that never ran.
    expect(describeTriggerFailure({ triggered: false, reason: "missing_webhook" })).toBe(
      "This agent is not connected yet, so nothing was started.",
    );
  });

  it("stays quiet when the run actually started", () => {
    expect(describeTriggerFailure({ triggered: true })).toBeNull();
    expect(describeTriggerFailure({ triggered: true, reason: "queued" })).toBeNull();
  });

  it("explains an inactive agent without implying a failure", () => {
    // An inactive agent is a deliberate state, not a fault. The copy must not send someone
    // looking for a broken integration, and it says "inactive" because that is the word the
    // catalogue uses and the badge on /agents/$name renders.
    expect(describeTriggerFailure({ triggered: false, reason: "agent_inactive" })).toBe(
      "This agent is inactive, so nothing was started.",
    );
  });

  it("reports a failure for any other not-triggered shape", () => {
    expect(describeTriggerFailure({ triggered: false })).toBe(
      "The agent could not be started. Nothing has changed.",
    );
    expect(describeTriggerFailure(null)).toBe(
      "The agent could not be started. Nothing has changed.",
    );
    expect(describeTriggerFailure(undefined)).toBe(
      "The agent could not be started. Nothing has changed.",
    );
  });
});
