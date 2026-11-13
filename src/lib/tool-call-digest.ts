import { createHash } from "node:crypto";

/**
 * Redacted correlation evidence for one agent tool call.
 *
 * The trace table must answer "what did the agent access, and did two calls carry the same
 * arguments?" without storing client PII. A tool call therefore records a SHA-256 over a
 * canonical serialization of its arguments (plus source and tool name), the top-level key names,
 * and the UUID target ids it named. This is correlation evidence, **not confidentiality**: a
 * low-entropy argument can be guessed and the digest recomputed, so callers must never treat the
 * digest as a secret or as an encryption of the arguments.
 */
export type ToolArgumentDigest = {
  /** 64 lowercase hex characters: sha256("v1|" + source + "|" + toolName + "|" + canonicalJson). */
  sha256: string;
  /** Top-level key names, filtered to safe identifier characters, deduped, sorted, capped at 20. */
  keys: string[];
  /** UUID values found on top-level `id` / `*_id` keys, lowercased and deduped. */
  targetIds: string[];
};

const KEY_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;
const MAX_KEYS = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recursively sorts object keys while preserving array order, so equal argument objects with a
 * different key insertion order produce the same digest. Mirrors `JSON.stringify` for plain JSON
 * values (the only values that can arrive over JSON-RPC).
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

/** Canonical JSON used inside the digest; exported so tests can pin the serialization. */
export function canonicalToolArgumentsJson(args: unknown): string {
  return JSON.stringify(canonicalize(args)) ?? "null";
}

function collectUuidValues(value: unknown, targetIds: string[]): void {
  if (typeof value === "string") {
    if (UUID_PATTERN.test(value)) targetIds.push(value.toLowerCase());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUuidValues(item, targetIds);
  }
}

/**
 * Computes the redacted digest of one tool call's arguments.
 *
 * Source and tool name are part of the hash so the same arguments used against two different
 * tools are distinguishable. `args` absent (undefined) still hashes a stable marker, so a call
 * with no arguments is traceable like any other.
 */
export function toolArgumentDigest(
  source: string,
  toolName: string,
  args: unknown,
): ToolArgumentDigest {
  const canonicalJson = canonicalToolArgumentsJson(args);
  const sha256 = createHash("sha256")
    .update(`v1|${source}|${toolName}|${canonicalJson}`)
    .digest("hex");

  const keys =
    args !== null && typeof args === "object" && !Array.isArray(args)
      ? Object.keys(args as Record<string, unknown>)
      : [];
  const filteredKeys = [...new Set(keys.filter((key) => KEY_PATTERN.test(key)))]
    .sort()
    .slice(0, MAX_KEYS);

  const targetIds: string[] = [];
  if (args !== null && typeof args === "object" && !Array.isArray(args)) {
    for (const key of Object.keys(args as Record<string, unknown>)) {
      if (key !== "id" && !key.endsWith("_id")) continue;
      collectUuidValues((args as Record<string, unknown>)[key], targetIds);
    }
  }

  return { sha256, keys: filteredKeys, targetIds: [...new Set(targetIds)].sort() };
}
