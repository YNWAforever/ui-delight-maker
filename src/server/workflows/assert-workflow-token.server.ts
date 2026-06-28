export function assertWorkflowToken(request: Request) {
  const expected = process.env.N8N_WORKFLOW_TOKEN;

  if (!expected) {
    throw new Response("Workflow token is not configured", { status: 500 });
  }

  const actual = request.headers.get("x-workflow-token");

  if (actual !== expected) {
    throw new Response("Unauthorized", { status: 401 });
  }
}
