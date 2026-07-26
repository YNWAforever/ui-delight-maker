import { classifyDatabaseFailure } from "@/server/db/postgres-error";
import type {
  CompanyWorkspaceError,
  CompanyWorkspaceErrorCode,
  CompanyWorkspaceSection,
} from "./types";

type CodedError = Error & { code?: string };

function errorCode(error: unknown) {
  return error instanceof Error ? (error as CodedError).code : undefined;
}

/**
 * Two of the codes this can return are not database failures — the app throws them itself
 * with a sentinel `code` that is not a SQLSTATE. Everything else is delegated to
 * `classifyDatabaseFailure`, which owns the SQLSTATE mapping for every read path so one code
 * cannot be called permanent by one screen and transient by another.
 */
const APP_CODES: Record<string, CompanyWorkspaceErrorCode> = {
  access_denied: "access_denied",
  company_not_found: "company_not_found",
};

export function toCompanyWorkspaceError(
  error: unknown,
  section?: CompanyWorkspaceSection,
  requestId: string = crypto.randomUUID(),
): CompanyWorkspaceError {
  const code = errorCode(error);
  const appCode = code ? APP_CODES[code] : undefined;
  if (appCode) {
    return { code: appCode, requestId, retryable: false, ...(section ? { section } : {}) };
  }

  const { kind, retryable } = classifyDatabaseFailure(error);
  return { code: kind, requestId, retryable, ...(section ? { section } : {}) };
}
