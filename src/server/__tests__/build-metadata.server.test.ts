import { describe, expect, it } from "vitest";
import { readPublicBuildMetadata } from "../build-metadata.server";

describe("public build metadata", () => {
  it("returns only a validated deploy commit SHA", () => {
    const sha = "a".repeat(40);
    expect(readPublicBuildMetadata({ VERCEL_GIT_COMMIT_SHA: sha })).toEqual({ commitSha: sha });
    expect(readPublicBuildMetadata({ GITHUB_SHA: sha })).toEqual({ commitSha: sha });
  });

  it("does not echo arbitrary environment values", () => {
    expect(readPublicBuildMetadata({ VERCEL_GIT_COMMIT_SHA: "secret=bad" })).toEqual({
      commitSha: null,
    });
    expect(readPublicBuildMetadata({ OTHER_SECRET: "sensitive" })).toEqual({ commitSha: null });
  });
});
