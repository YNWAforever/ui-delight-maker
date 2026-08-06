import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Every route under `src/routes/api/workflows/` is publicly routable and guarded only by the
 * shared n8n token, so "the handler calls assertWorkflowToken, first, before it touches
 * anything" is the security property of this whole directory.
 *
 * This drives each handler for real rather than grepping its source for the call: the file
 * list is read off disk so a new endpoint is covered the day it is added, and each handler is
 * invoked with a token-less request and asserted to reject. A handler that forgot the guard —
 * or that parses the body before running it — fails here, because a repository call with no
 * database configured throws something that is not a 401 Response.
 */
const WORKFLOW_ROUTES_DIR = resolve(import.meta.dirname, "..");

function collectRouteFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("__") || entry.name.startsWith("-")) return [];
    if (entry.isDirectory()) {
      return collectRouteFiles(resolve(dir, entry.name), `${prefix}${entry.name}/`);
    }
    return entry.name.endsWith(".ts") ? [`${prefix}${entry.name.replace(/\.ts$/, "")}`] : [];
  });
}

const routeNames = collectRouteFiles(WORKFLOW_ROUTES_DIR);

type ServerRoute = {
  options?: { server?: { handlers?: Record<string, (args: { request: Request }) => unknown> } };
};

const originalToken = process.env.N8N_WORKFLOW_TOKEN;

describe("workflow endpoints reject unauthenticated callers", () => {
  beforeEach(() => {
    process.env.N8N_WORKFLOW_TOKEN = "expected-token";
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.N8N_WORKFLOW_TOKEN;
    else process.env.N8N_WORKFLOW_TOKEN = originalToken;
  });

  it("finds every workflow route on disk", () => {
    // A guard on the guard: if the directory walk silently returns nothing, the whole suite
    // below would vacuously pass.
    expect(routeNames.length).toBeGreaterThanOrEqual(8);
  });

  it.each(routeNames)("%s rejects a request with no workflow token", async (routeName) => {
    const module = (await import(/* @vite-ignore */ `../${routeName}`)) as { Route: ServerRoute };
    const post = module.Route.options?.server?.handlers?.POST;
    expect(post, `${routeName} has no POST handler`).toBeTypeOf("function");

    const request = new Request(`https://clientops.example.com/api/workflows/${routeName}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lead_id: "lead-1", agent_run_id: "run-1" }),
    });

    await expect(Promise.resolve().then(() => post!({ request }))).rejects.toSatisfy(
      (error: unknown) => error instanceof Response && error.status === 401,
      "expected a 401 Response to be thrown before any work happened",
    );
  });

  it.each(routeNames)("%s rejects a request with the wrong workflow token", async (routeName) => {
    const module = (await import(/* @vite-ignore */ `../${routeName}`)) as { Route: ServerRoute };
    const post = module.Route.options?.server?.handlers?.POST;

    const request = new Request(`https://clientops.example.com/api/workflows/${routeName}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-workflow-token": "wrong-token" },
      body: JSON.stringify({ lead_id: "lead-1", agent_run_id: "run-1" }),
    });

    await expect(Promise.resolve().then(() => post!({ request }))).rejects.toSatisfy(
      (error: unknown) => error instanceof Response && error.status === 401,
      "expected a 401 Response to be thrown before any work happened",
    );
  });
});
