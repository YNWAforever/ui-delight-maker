export type AdminErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "OUTSIDE_SCOPE"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "LAST_SUPER_ADMIN"
  | "OPEN_WORK_REMAINS"
  | "STALE_ADMIN_STATE";

export class AdminError extends Error {
  constructor(
    public readonly code: AdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminError";
  }
}
