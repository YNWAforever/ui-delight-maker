import { z } from "zod";

export type OperationErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE";

export class OperationError extends Error {
  readonly code: OperationErrorCode;
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    code: OperationErrorCode,
    message: string,
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "OperationError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function parseOperationInput<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "_";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  throw new OperationError("INVALID_INPUT", "Invalid input", fieldErrors);
}
