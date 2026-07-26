export type PostgresError = Error & { code: string };

// Postgres reports failures as five-character SQLSTATE codes. The two that took down
// /relationships and /renewals were 42703 (undefined_column) and 42P18
// (indeterminate_datatype). Node driver errors such as ENOTFOUND are not SQLSTATEs.
const SQLSTATE = /^[0-9A-Z]{5}$/;

export function isPostgresError(error: unknown): error is PostgresError {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && SQLSTATE.test(code);
}

/**
 * How a failed read is described to the caller that has to render it.
 *
 * `schema_mismatch` — the query text disagrees with the schema it ran against.
 * `query_timeout`   — the connection dropped, or two transactions collided.
 * `query_failed`    — anything else. Deliberately vague: the driver message often quotes the
 *                     SQL, and that must not reach a browser.
 */
export type DatabaseFailureKind = "schema_mismatch" | "query_timeout" | "query_failed";

export type DatabaseFailure = {
  kind: DatabaseFailureKind;
  /**
   * Whether re-running the identical query could plausibly succeed. Read paths use this to
   * choose between an automatic retry and a terminal panel, so a wrong `true` turns a
   * permanent break into a retry the user cannot escape.
   */
  retryable: boolean;
};

/**
 * SQLSTATEs where the SQL does not match the schema. 42703 and 42P18 are the two that
 * reached production; the rest are the same class of mistake, listed so they get the same
 * label instead of the vague fallback.
 */
const SCHEMA_MISMATCH = new Set([
  "42P01", // undefined_table
  "42703", // undefined_column
  "42883", // undefined_function — also "operator does not exist"
  "42P18", // indeterminate_datatype
  "42804", // datatype_mismatch
  "42601", // syntax_error
]);

/**
 * Failures where the query never got a fair run. These are the only codes worth retrying.
 */
const TRANSIENT = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "08006", // connection_failure
  "57P03", // cannot_connect_now
  "40001", // serialization_failure
  "40P01", // deadlock_detected
]);

/**
 * SQLSTATE class 42 is "syntax error or access rule violation": every code in it means the
 * statement is wrong for this database, so no amount of retrying helps.
 */
function isProgrammingError(code: string) {
  return code.startsWith("42");
}

/**
 * The single place that turns a thrown database error into something a read path can return.
 *
 * Both workspace read paths route through here, so one SQLSTATE cannot be called permanent
 * by one screen and transient by another — which is precisely what happened while the
 * Company Workspace mapped codes and the Client Workspace hardcoded `retryable: true`.
 */
export function classifyDatabaseFailure(error: unknown): DatabaseFailure {
  const code = error instanceof Error ? (error as { code?: unknown }).code : undefined;
  if (typeof code !== "string") return { kind: "query_failed", retryable: false };

  // Class 42 is checked before the transient set, not after, so a programming error can
  // never be reported retryable even if someone later adds a 42xxx code to TRANSIENT.
  if (isProgrammingError(code)) {
    return {
      kind: SCHEMA_MISMATCH.has(code) ? "schema_mismatch" : "query_failed",
      retryable: false,
    };
  }

  if (TRANSIENT.has(code)) return { kind: "query_timeout", retryable: true };
  return { kind: "query_failed", retryable: false };
}
