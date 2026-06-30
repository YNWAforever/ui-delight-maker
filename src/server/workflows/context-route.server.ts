import type { WorkflowContextRequestPayload } from "@/lib/workflows/types";

const MISSING_CONTEXT_IDS_MESSAGE = "Missing lead_id or agent_run_id";

function badContextRequestResponse() {
  return new Response(MISSING_CONTEXT_IDS_MESSAGE, { status: 400 });
}

function isValidContextRequestPayload(value: unknown): value is WorkflowContextRequestPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Partial<Record<keyof WorkflowContextRequestPayload, unknown>>;

  return (
    typeof payload.lead_id === "string" &&
    payload.lead_id.length > 0 &&
    typeof payload.agent_run_id === "string" &&
    payload.agent_run_id.length > 0
  );
}

export async function readWorkflowContextRequestPayload(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return badContextRequestResponse();
  }

  if (!isValidContextRequestPayload(payload)) {
    return badContextRequestResponse();
  }

  return payload;
}

export function getWorkflowContextErrorResponse(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message === "Lead not found" || error.message === "Agent run not found") {
    return new Response(error.message, { status: 404 });
  }

  if (error.message === "Agent run does not belong to lead") {
    return new Response(error.message, { status: 400 });
  }

  return null;
}
