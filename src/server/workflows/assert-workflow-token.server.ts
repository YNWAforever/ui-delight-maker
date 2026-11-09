import { createHash, timingSafeEqual } from "node:crypto";

/** Hashing both sides guarantees equal-length buffers for every attacker-supplied value. */
function tokenDigest(token: string) {
  return createHash("sha256").update(token, "utf8").digest();
}

/**
 * Constant-time workflow token check.
 *
 * `!==` short-circuits at the first differing byte, so a caller that can measure response
 * timing can recover the shared token byte by byte and then replay it against every public
 * workflow route. Both sides are SHA-256 hashed so `timingSafeEqual` compares exactly 32
 * bytes regardless of the header length, and a missing header is rejected before any hashing.
 */
export function assertWorkflowToken(request: Request) {
  const expected = process.env.N8N_WORKFLOW_TOKEN;

  // Fail closed: a missing secret must never mean "no token required".
  if (!expected) {
    throw new Response("Workflow token is not configured", { status: 500 });
  }

  const actual = request.headers.get("x-workflow-token");

  if (!actual || !timingSafeEqual(tokenDigest(actual), tokenDigest(expected))) {
    throw new Response("Unauthorized", { status: 401 });
  }
}
