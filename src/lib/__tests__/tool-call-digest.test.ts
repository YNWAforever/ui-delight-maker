import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalToolArgumentsJson, toolArgumentDigest } from "../tool-call-digest";

const APPROVAL_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";
const ACCOUNT_ID = "9f461e2c-5f3a-4d3f-9c2b-7a8e6d5c4b3a";

describe("canonical tool arguments JSON", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(canonicalToolArgumentsJson({ b: 1, a: { d: 2, c: [3, 1] } })).toBe(
      '{"a":{"c":[3,1],"d":2},"b":1}',
    );
  });

  it("serializes primitives, arrays and absent arguments deterministically", () => {
    expect(canonicalToolArgumentsJson(undefined)).toBe("null");
    expect(canonicalToolArgumentsJson(null)).toBe("null");
    expect(canonicalToolArgumentsJson("text")).toBe('"text"');
    expect(canonicalToolArgumentsJson([{ b: 2, a: 1 }])).toBe('[{"a":1,"b":2}]');
  });

  it("drops undefined object values like JSON.stringify", () => {
    expect(canonicalToolArgumentsJson({ keep: 1, skip: undefined })).toBe('{"keep":1}');
  });
});

describe("toolArgumentDigest", () => {
  it("returns a 64-hex sha256 over the versioned canonical payload", () => {
    const args = { query: "acme", limit: 5 };
    const digest = toolArgumentDigest("mcp", "search", args);
    const expected = createHash("sha256")
      .update(`v1|mcp|search|${canonicalToolArgumentsJson(args)}`)
      .digest("hex");

    expect(digest.sha256).toBe(expected);
    expect(digest.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not depend on object key insertion order", () => {
    const first = toolArgumentDigest("mcp", "get_quote", { limit: 10, id: ACCOUNT_ID });
    const second = toolArgumentDigest("mcp", "get_quote", { id: ACCOUNT_ID, limit: 10 });
    expect(first).toEqual(second);
  });

  it("separates sources and tool names even for identical arguments", () => {
    const args = { id: ACCOUNT_ID };
    const base = toolArgumentDigest("mcp", "get_account", args).sha256;
    expect(toolArgumentDigest("governed_ai", "get_account", args).sha256).not.toBe(base);
    expect(toolArgumentDigest("mcp", "get_quote", args).sha256).not.toBe(base);
    expect(toolArgumentDigest("mcp", "get_account", { id: ACCOUNT_ID, extra: 1 }).sha256).not.toBe(
      base,
    );
  });

  it("keeps only safe, deduped, sorted top-level key names capped at twenty", () => {
    const args: Record<string, unknown> = {
      valid_key: 1,
      "nested.key": 2,
      "with-dash": 3,
      "bad key": 4,
      "bad/slash": 5,
      ["x".repeat(41)]: 6,
    };
    for (let index = 0; index < 25; index += 1) {
      args[`zz_filler_${String(index).padStart(2, "0")}`] = index;
    }

    const digest = toolArgumentDigest("mcp", "tool", args);
    expect(digest.keys).toHaveLength(20);
    expect(digest.keys).toEqual([...digest.keys].sort());
    expect(new Set(digest.keys).size).toBe(digest.keys.length);
    expect(digest.keys).toContain("valid_key");
    expect(digest.keys).toContain("nested.key");
    expect(digest.keys).toContain("with-dash");
    expect(digest.keys).not.toContain("bad key");
    expect(digest.keys).not.toContain("bad/slash");
    expect(digest.keys).not.toContain("x".repeat(41));
  });

  it("collects UUID target ids from id and *_id keys, including arrays", () => {
    const digest = toolArgumentDigest("mcp", "tool", {
      id: ACCOUNT_ID,
      approval_id: APPROVAL_ID,
      client_ids: [ACCOUNT_ID, "not-a-uuid"],
      owner_id: "Alex",
      account_id: ACCOUNT_ID.toUpperCase(),
    });

    expect(digest.targetIds).toEqual([ACCOUNT_ID, APPROVAL_ID].sort());
  });

  it("returns no keys or targets for non-object arguments", () => {
    expect(toolArgumentDigest("mcp", "search", "plain text")).toEqual(
      expect.objectContaining({ keys: [], targetIds: [] }),
    );
    expect(toolArgumentDigest("mcp", "search", [ACCOUNT_ID]).targetIds).toEqual([]);
  });
});
