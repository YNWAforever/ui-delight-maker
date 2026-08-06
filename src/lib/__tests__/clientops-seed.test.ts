import { describe, expect, it } from "vitest";
import {
  CLIENTOPS_DESTRUCTIVE_RESET_CONFIRMATION,
  addDaysToDateString,
  assertSeedAllowed,
  buildSeedDates,
  databaseUrlLooksProductionLike,
  getDeploySeedDecision,
  getSeedMode,
} from "../clientops-seed";

describe("getSeedMode", () => {
  it("defaults to staging-smoke", () => {
    expect(getSeedMode({})).toBe("staging-smoke");
  });

  it("accepts staging-smoke, staging-demo, and local-demo-reset", () => {
    expect(getSeedMode({ CLIENTOPS_SEED_MODE: "staging-smoke" })).toBe("staging-smoke");
    expect(getSeedMode({ CLIENTOPS_SEED_MODE: "staging-demo" })).toBe("staging-demo");
    expect(getSeedMode({ CLIENTOPS_SEED_MODE: "local-demo-reset" })).toBe("local-demo-reset");
  });

  it("rejects an unknown seed mode", () => {
    expect(() => getSeedMode({ CLIENTOPS_SEED_MODE: "wipe-everything" })).toThrow(
      "Unsupported CLIENTOPS_SEED_MODE: wipe-everything",
    );
  });
});

describe("databaseUrlLooksProductionLike", () => {
  it("flags production-looking URLs", () => {
    expect(databaseUrlLooksProductionLike("postgres://user@prod-db.example/neondb")).toBe(true);
    expect(databaseUrlLooksProductionLike("postgres://user@example/production")).toBe(true);
    expect(databaseUrlLooksProductionLike("postgres://user@example/prd")).toBe(true);
  });

  it("allows local and staging-looking URLs", () => {
    expect(databaseUrlLooksProductionLike("postgres://user@localhost:5432/clientops")).toBe(false);
    expect(databaseUrlLooksProductionLike("postgres://user@staging-db.example/neondb")).toBe(false);
  });
});

describe("assertSeedAllowed", () => {
  const databaseUrl = "postgres://user@localhost:5432/clientops";

  it("allows staging-smoke with staging gates", () => {
    expect(() =>
      assertSeedAllowed({
        mode: "staging-smoke",
        databaseUrl,
        env: {
          CLIENTOPS_ALLOW_STAGING_SEED: "1",
          CLIENTOPS_SEED_TARGET: "staging",
        },
      }),
    ).not.toThrow();
  });

  it("allows staging-demo with staging gates and no destructive confirmation", () => {
    expect(() =>
      assertSeedAllowed({
        mode: "staging-demo",
        databaseUrl,
        env: {
          CLIENTOPS_ALLOW_STAGING_SEED: "1",
          CLIENTOPS_SEED_TARGET: "staging",
        },
      }),
    ).not.toThrow();
  });

  it("allows local-demo-reset only with local destructive gates", () => {
    expect(() =>
      assertSeedAllowed({
        mode: "local-demo-reset",
        databaseUrl,
        env: {
          CLIENTOPS_ALLOW_STAGING_SEED: "1",
          CLIENTOPS_SEED_TARGET: "local",
          CLIENTOPS_DESTRUCTIVE_RESET: CLIENTOPS_DESTRUCTIVE_RESET_CONFIRMATION,
        },
      }),
    ).not.toThrow();
  });

  it("rejects local-demo-reset without destructive confirmation", () => {
    expect(() =>
      assertSeedAllowed({
        mode: "local-demo-reset",
        databaseUrl,
        env: {
          CLIENTOPS_ALLOW_STAGING_SEED: "1",
          CLIENTOPS_SEED_TARGET: "local",
        },
      }),
    ).toThrow("CLIENTOPS_DESTRUCTIVE_RESET must be I_UNDERSTAND");
  });

  it("rejects production-looking URLs in every mode", () => {
    expect(() =>
      assertSeedAllowed({
        mode: "staging-smoke",
        databaseUrl: "postgres://user@prod-db.example/neondb",
        env: {
          CLIENTOPS_ALLOW_STAGING_SEED: "1",
          CLIENTOPS_SEED_TARGET: "staging",
        },
      }),
    ).toThrow("DATABASE_URL looks like production");
  });
});

describe("getDeploySeedDecision", () => {
  it("skips deploy seeding unless explicitly enabled", () => {
    expect(getDeploySeedDecision({})).toEqual({
      shouldSeed: false,
      reason: "CLIENTOPS_SEED_ON_DEPLOY is not 1",
    });
  });

  // The point of these three: CLIENTOPS_SEED_ON_DEPLOY must not be able to satisfy the guards
  // that assertSeedAllowed goes on to check. It used to default all three of them, so one
  // variable turned the whole interlock on and the only thing left protecting production was a
  // substring test against DATABASE_URL.
  it("does not seed when only CLIENTOPS_SEED_ON_DEPLOY is set", () => {
    expect(getDeploySeedDecision({ CLIENTOPS_SEED_ON_DEPLOY: "1" })).toEqual({
      shouldSeed: false,
      reason: "CLIENTOPS_ALLOW_STAGING_SEED must be set to 1 explicitly to seed on deploy",
    });
  });

  it.each([
    [
      { CLIENTOPS_ALLOW_STAGING_SEED: "1" },
      "CLIENTOPS_SEED_TARGET must be set explicitly to seed on deploy",
    ],
    [
      { CLIENTOPS_ALLOW_STAGING_SEED: "1", CLIENTOPS_SEED_TARGET: "staging" },
      "CLIENTOPS_SEED_MODE must be set explicitly to seed on deploy",
    ],
  ])("requires every guard to be set explicitly (%o)", (env, reason) => {
    expect(getDeploySeedDecision({ CLIENTOPS_SEED_ON_DEPLOY: "1", ...env })).toEqual({
      shouldSeed: false,
      reason,
    });
  });

  it("refuses to seed a Vercel production deployment even when every guard is set", () => {
    expect(
      getDeploySeedDecision({
        CLIENTOPS_SEED_ON_DEPLOY: "1",
        CLIENTOPS_ALLOW_STAGING_SEED: "1",
        CLIENTOPS_SEED_MODE: "staging-demo",
        CLIENTOPS_SEED_TARGET: "staging",
        VERCEL_ENV: "production",
      }),
    ).toEqual({
      shouldSeed: false,
      reason: "refusing to seed a Vercel production deployment",
    });
  });

  it("passes through the operator's explicit deploy seed settings", () => {
    expect(
      getDeploySeedDecision({
        CLIENTOPS_SEED_ON_DEPLOY: "1",
        CLIENTOPS_ALLOW_STAGING_SEED: "1",
        CLIENTOPS_SEED_MODE: "staging-smoke",
        CLIENTOPS_SEED_TARGET: "staging",
        CLIENTOPS_SEED_TODAY: "2026-07-05",
        VERCEL_ENV: "preview",
      }),
    ).toEqual({
      shouldSeed: true,
      env: {
        CLIENTOPS_ALLOW_STAGING_SEED: "1",
        CLIENTOPS_SEED_MODE: "staging-smoke",
        CLIENTOPS_SEED_TARGET: "staging",
        CLIENTOPS_SEED_TODAY: "2026-07-05",
      },
    });
  });
});

describe("seed date helpers", () => {
  it("adds days to YYYY-MM-DD dates in UTC", () => {
    expect(addDaysToDateString("2026-07-05", -10)).toBe("2026-06-25");
    expect(addDaysToDateString("2026-07-05", 30)).toBe("2026-08-04");
  });

  it("builds useful relative dates", () => {
    expect(buildSeedDates("2026-07-05")).toEqual({
      today: "2026-07-05",
      overdueRenewal: "2026-06-25",
      renewal30: "2026-07-26",
      renewal60: "2026-08-26",
      renewal90: "2026-09-27",
      renewalLater: "2026-12-02",
      recentTouch: "2026-07-01T12:00:00.000Z",
      staleTouch: "2026-05-26T12:00:00.000Z",
      oldStart: "2026-03-27",
      recentStart: "2026-06-25",
      overdueTask: "2026-07-01",
      futureTask: "2026-07-12",
    });
  });
});
