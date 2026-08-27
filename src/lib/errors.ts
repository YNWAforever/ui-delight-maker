/**
 * Turning a thrown value into something a user may see.
 *
 * Raw `error.message` currently reaches users at 22 call sites, two of them rendered
 * straight into the page body. Server functions throw plain `Error`s, and their messages
 * range from genuinely helpful ("Agent is required") to things that must never leave the
 * server — Postgres driver text quotes the failing SQL, and connection errors carry
 * hostnames.
 *
 * The rule here is deny-by-default on *shape*, not a blocklist of words. A message is
 * passed through only if it looks like a sentence a person wrote for another person:
 * short, no SQL, no stack frames, no file paths, no identifiers. Everything else becomes
 * a generic recoverable message, because a vague message the user can act on beats a
 * precise one that leaks the schema.
 */

/** Shown when the real message cannot be trusted. Deliberately actionable, not apologetic. */
const GENERIC = "Something went wrong. Please try again.";

const GENERIC_BY_KIND = {
  server: GENERIC,
  offline: "You appear to be offline. Check your connection and try again.",
  stale: "This view is out of date. Refresh to see the latest.",
  permission: "You do not have access to this.",
  notFound: "That record no longer exists.",
} as const;

export type SafeErrorKind = keyof typeof GENERIC_BY_KIND;

/**
 * Markers that mean the text came from infrastructure rather than a person.
 *
 * Matched case-insensitively against the whole message. This is a backstop: the shape
 * checks below reject most driver output before it gets here.
 */
const TECHNICAL_MARKERS = [
  "postgres",
  "postgresql",
  "neon",
  "supabase",
  "sqlstate",
  "syntax error",
  "relation ",
  "column ",
  "constraint",
  "violates",
  "duplicate key",
  "null value in",
  "econnrefused",
  "enotfound",
  "etimedout",
  "econnreset",
  "socket hang up",
  "fetch failed",
  "unexpected token",
  "is not a function",
  "cannot read properties",
  "undefined is not",
  "stack",
  "node_modules",
  // Postgres server messages that name no table and quote no SQL, and so slipped every
  // shape check above. They are short, lower-case and read like English, which is exactly
  // why they got through — and two of them leak real secrets: `password authentication
  // failed for user "clientops_rw"` prints the database role, and `permission denied for
  // table accounts` prints a table name. The rest ("sorry, too many clients already")
  // describe our capacity problem to someone who can do nothing about it.
  "connection",
  "too many clients",
  "authentication failed",
  "permission denied",
  "invalid input syntax",
  "canceling statement",
  "statement timeout",
  "deadlock detected",
  "server closed",
  "pg_",
];

/**
 * SQL *syntax* in a message means the query text is being quoted back.
 *
 * Deliberately not a bare keyword list. "Select" is ordinary UI copy — "Select a stage
 * first", "Select at least one lead" — so matching the word alone suppressed legitimate
 * validation messages. Each pattern below needs two parts of a statement to fire.
 */
const SQL_SHAPE =
  /\bselect\b[\s\S]*\bfrom\b|\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b|\bwhere\s+[\w."]+\s*(=|like|in)\b/i;

/** `at Foo.bar (/path/file.ts:12:3)` and friends. */
const STACK_SHAPE = /\bat\s+\S+\s*\(|\.[jt]sx?:\d+|\n\s+at\s/;

/** Windows or POSIX paths, and bare module specifiers. */
const PATH_SHAPE = /(^|\s)(\/[\w.-]+){2,}|[a-z]:\\|\bsrc[\\/]/i;

/** Five-character SQLSTATE codes such as 42703. */
const SQLSTATE_SHAPE = /\b\d{2}[0-9A-Z]{3}\b/;

/**
 * Driver and framework messages run long. A message a human wrote for a user is short.
 * This is the single most effective filter, and it needs no vocabulary.
 */
const MAX_LENGTH = 140;

function looksHumanWritten(message: string): boolean {
  if (message.length === 0 || message.length > MAX_LENGTH) return false;
  if (message.includes("\n")) return false;
  if (SQL_SHAPE.test(message)) return false;
  if (STACK_SHAPE.test(message)) return false;
  if (PATH_SHAPE.test(message)) return false;
  if (SQLSTATE_SHAPE.test(message)) return false;

  const lower = message.toLowerCase();
  return !TECHNICAL_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * The message to show a user for a thrown value.
 *
 * @param error the caught value, of any shape
 * @param kind what the caller knows about the failure, used for the fallback wording
 */
export function toSafeErrorMessage(error: unknown, kind: SafeErrorKind = "server"): string {
  const fallback = GENERIC_BY_KIND[kind];

  if (typeof error === "string") {
    return looksHumanWritten(error) ? error : fallback;
  }

  if (error instanceof Error) {
    // An explicit HTTP-ish status is more reliable than any message text.
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") {
      if (status === 401 || status === 403) return GENERIC_BY_KIND.permission;
      if (status === 404) return GENERIC_BY_KIND.notFound;
      if (status === 408 || status === 504) return GENERIC_BY_KIND.offline;
    }

    return looksHumanWritten(error.message) ? error.message : fallback;
  }

  return fallback;
}

/**
 * Whether a dispatched agent run actually started.
 *
 * Six server functions return `{ triggered: false, reason: "missing_webhook" }` instead of
 * throwing when their webhook URL is unset. Three call sites currently toast success
 * anyway, reporting work that never happened. Any call site that dispatches agent work
 * must run its result through this before claiming success.
 *
 * Returns null when the run started, or the sentence to show when it did not.
 */
export type TriggerResult = { triggered?: boolean; reason?: string } | null | undefined;

export function describeTriggerFailure(result: TriggerResult): string | null {
  if (result && result.triggered !== false) return null;

  if (result?.reason === "missing_webhook") {
    return "This agent is not connected yet, so nothing was started.";
  }
  return "The agent could not be started. Nothing has changed.";
}
