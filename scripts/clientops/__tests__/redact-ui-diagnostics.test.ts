import { describe, expect, it } from "vitest";
import { request } from "playwright";
import { redactUiDiagnostic } from "../redact-ui-diagnostics";
const sentinel = "synthetic-credential-sentinel";
describe("private UAT diagnostic publication", () => {
  it("redacts real Playwright failed-request header diagnostics using fake credentials", async () => {
    const context = await request.newContext();
    try {
      let failure: unknown;
      try {
        await context.get("http://127.0.0.1:9/api/auth/get-session", {
          headers: { Cookie: "test=" + sentinel, Authorization: "Bearer " + sentinel },
          timeout: 2000,
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      const diagnostic = (failure as Error).message;
      expect(diagnostic).toContain(sentinel);
      expect(redactUiDiagnostic(diagnostic)).not.toContain(sentinel);
    } finally {
      await context.dispose();
    }
  });
  it.each([
    ["cookie", "cookie: session=" + sentinel],
    ["authorization", "Authorization: Bearer " + sentinel],
    ["JSON token", '{"access_token":"' + sentinel + '"}'],
    ["DSN", "postgresql://user:" + sentinel + "@db.invalid/test"],
    ["password", "password=" + sentinel],
  ])("redacts %s without printing a credential", (_, diagnostic) => {
    const output = redactUiDiagnostic(diagnostic);
    expect(output).not.toContain(sentinel);
    expect(output).not.toContain("postgresql://");
  });
  it("preserves useful domain status failures while deidentifying URLs and email", () => {
    const output = redactUiDiagnostic(
      "Policy failed: 200 !== 409\nhttps://fixture.invalid/path\nactor@fixture.invalid",
    );
    expect(output).toContain("200 !== 409");
    expect(output).not.toContain("fixture.invalid");
  });
  it("bounds safe diagnostic output", () => {
    expect(redactUiDiagnostic("x".repeat(900))).toHaveLength(600);
  });
});
