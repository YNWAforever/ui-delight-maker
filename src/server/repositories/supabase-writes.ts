/**
 * Shared rules for the Supabase-backed repositories.
 *
 * Two things every one of them needs and none of them had:
 *
 * 1. A column allowlist on writes. The update paths already had one, spelled out as conditional
 *    spreads; the create paths passed the caller's object straight to PostgREST. Since every one
 *    of these handlers validates with a bare `as` cast, "the caller's object" means whatever
 *    arrived over the wire.
 * 2. An error that does not hand the caller the driver's message. PostgREST names the table and
 *    column it failed on, and `throw new Error(error.message)` put that in the response body.
 *    `src/server/auth/resource-ownership.ts` already solved this for the ownership path; this is
 *    the same shape, applied to the rest.
 */

/**
 * The allowed keys of `source` that were actually provided.
 *
 * Keyed on `!== undefined`, matching the update paths: an explicit `null` is a value and gets
 * written, an absent key is left out entirely. Unknown keys are dropped rather than rejected,
 * because rejecting would turn a client sending a stray field into a failed write where it used
 * to be a successful one.
 */
export function pickColumns<T extends object, K extends keyof T>(
  source: T,
  columns: readonly K[],
): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const column of columns) {
    if (source[column] !== undefined) picked[column] = source[column];
  }
  return picked;
}

/**
 * A failure a caller can be shown, with the driver's text kept for the logs.
 *
 * The message names what the user was trying to do, not what the database said. The original
 * goes on `cause`, so a server log still has the PostgREST detail while the response body does
 * not — the same split `ownershipLookupFailed` makes, and the same reason `postgres-error.ts`
 * calls its fallback "deliberately vague".
 */
export function supabaseOperationFailed(description: string, cause: { message: string }): Error {
  return new Error(`Could not ${description}`, { cause: new Error(cause.message) });
}
