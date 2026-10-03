import { AdminError } from "@/lib/admin/errors";
import { OperationError } from "./errors";

/** Only server-thrown domain errors determine HTTP status; never request data/context. */
export function serverFunctionErrorStatus(error: unknown): number | null {
  if (error instanceof AdminError) {
    if (error.code === "UNAUTHENTICATED") return 401;
    if (error.code === "FORBIDDEN" || error.code === "OUTSIDE_SCOPE") return 403;
    if (error.code === "VALIDATION_FAILED") return 400;
    return 409;
  }
  if (error instanceof OperationError) {
    if (error.code === "FORBIDDEN") return 403;
    if (error.code === "INVALID_INPUT") return 400;
    if (error.code === "NOT_FOUND") return 404;
    return 409;
  }
  // Framework redirects/not-found and unrelated failures retain their existing handling.
  return null;
}

/** TanStack catches handler errors into next().error before serialization. */
export async function withServerFunctionErrorStatus<T>(
  next: () => Promise<T>,
  setStatus: (status: number) => void,
): Promise<T> {
  try {
    const result = await next();
    const error =
      result !== null && typeof result === "object" && "error" in result ? result.error : undefined;
    const status = serverFunctionErrorStatus(error);
    if (status !== null) setStatus(status);
    return result;
  } catch (error) {
    const status = serverFunctionErrorStatus(error);
    if (status !== null) setStatus(status);
    throw error;
  }
}
