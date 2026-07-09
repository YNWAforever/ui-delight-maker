import { describe, expect, it } from "vitest";

import eslintConfig from "../../../eslint.config.js";

describe("ESLint config", () => {
  it("ignores generated and nested worktree folders", () => {
    const ignoredPaths = eslintConfig.flatMap((entry) => entry.ignores ?? []);

    expect(ignoredPaths).toContain("dist/**");
    expect(ignoredPaths).toContain(".output/**");
    expect(ignoredPaths).toContain(".vinxi/**");
    expect(ignoredPaths).toContain(".tmp/**");
    expect(ignoredPaths).toContain(".worktrees/**");
  });
});
