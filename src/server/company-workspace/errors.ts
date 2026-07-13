import type {
  CompanyWorkspaceError,
  CompanyWorkspaceErrorCode,
  CompanyWorkspaceSection,
} from "./types";

type CodedError = Error & { code?: string };

function errorCode(error: unknown) {
  return error instanceof Error ? (error as CodedError).code : undefined;
}

export function toCompanyWorkspaceError(
  error: unknown,
  section?: CompanyWorkspaceSection,
  requestId: string = crypto.randomUUID(),
): CompanyWorkspaceError {
  const code = errorCode(error);
  let mapped: CompanyWorkspaceErrorCode = "query_failed";
  let retryable = false;

  if (code === "42P01" || code === "42703" || code === "42883") {
    mapped = "schema_mismatch";
  } else if (code === "ETIMEDOUT" || code === "ECONNRESET") {
    mapped = "query_timeout";
    retryable = true;
  } else if (code === "access_denied") {
    mapped = "access_denied";
  } else if (code === "company_not_found") {
    mapped = "company_not_found";
  }

  return { code: mapped, requestId, retryable, ...(section ? { section } : {}) };
}
