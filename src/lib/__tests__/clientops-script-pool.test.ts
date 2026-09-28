import { describe, expect, it } from "vitest";
import { selectClientOpsScriptDriver } from "../clientops-script-pool";

const LOCAL_URL = "postgres://clientops:clientops@127.0.0.1:54329/clientops_test";
const NEON_URL = "postgres://user:example@ep-example.neon.tech/neondb";

describe("ClientOps script database driver", () => {
  it("keeps the Neon driver unless the local rehearsal flag is explicit", () => {
    expect(selectClientOpsScriptDriver(NEON_URL, {})).toBe("neon");
    expect(selectClientOpsScriptDriver(LOCAL_URL, { CLIENTOPS_SCRIPT_LOCAL_PG: "0" })).toBe("neon");
  });

  it("permits pg only for a matching disposable loopback test database", () => {
    expect(
      selectClientOpsScriptDriver(LOCAL_URL, {
        CLIENTOPS_SCRIPT_LOCAL_PG: "1",
        DATABASE_URL: LOCAL_URL,
        DATABASE_TEST_URL: LOCAL_URL,
      }),
    ).toBe("pg");
  });

  it.each([
    [NEON_URL, NEON_URL, NEON_URL],
    [
      "postgres://clientops:clientops@localhost:54329/clientops_test",
      "postgres://clientops:clientops@localhost:54329/clientops_test",
      "postgres://clientops:clientops@localhost:54329/clientops_test",
    ],
    [
      "postgres://clientops:clientops@127.0.0.1:54329/clientops",
      "postgres://clientops:clientops@127.0.0.1:54329/clientops",
      "postgres://clientops:clientops@127.0.0.1:54329/clientops",
    ],
    [LOCAL_URL, LOCAL_URL, undefined],
    [LOCAL_URL, NEON_URL, LOCAL_URL],
  ])("rejects a local pg override without all isolation guards", (target, databaseUrl, testUrl) => {
    expect(() =>
      selectClientOpsScriptDriver(target, {
        CLIENTOPS_SCRIPT_LOCAL_PG: "1",
        DATABASE_URL: databaseUrl,
        DATABASE_TEST_URL: testUrl,
      }),
    ).toThrow(/disposable loopback|match/);
  });
});
