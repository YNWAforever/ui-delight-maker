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
