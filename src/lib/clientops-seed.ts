export type ClientOpsSeedMode = "staging-smoke" | "staging-demo" | "local-demo-reset";

export const CLIENTOPS_DESTRUCTIVE_RESET_CONFIRMATION = "I_UNDERSTAND";

type SeedEnv = Record<string, string | undefined>;

export function getSeedMode(env: SeedEnv): ClientOpsSeedMode {
  const mode = env.CLIENTOPS_SEED_MODE ?? "staging-smoke";
  if (mode === "staging-smoke" || mode === "staging-demo" || mode === "local-demo-reset") {
    return mode;
  }
  throw new Error(`Unsupported CLIENTOPS_SEED_MODE: ${mode}`);
}

export function isStagingSeedMode(mode: ClientOpsSeedMode) {
  return mode === "staging-smoke" || mode === "staging-demo";
}

export function isFullDemoSeedMode(mode: ClientOpsSeedMode) {
  return mode === "staging-demo" || mode === "local-demo-reset";
}

export function databaseUrlLooksProductionLike(databaseUrl: string) {
  const lowered = databaseUrl.toLowerCase();
  return (
    /(^|[-_.:/@])prod([-_.:/@]|$)/.test(lowered) ||
    /(^|[-_.:/@])prd([-_.:/@]|$)/.test(lowered) ||
    lowered.includes("production")
  );
}

export function assertSeedAllowed(input: {
  mode: ClientOpsSeedMode;
  databaseUrl: string;
  env: SeedEnv;
}) {
  if (input.env.CLIENTOPS_ALLOW_STAGING_SEED !== "1") {
    throw new Error("CLIENTOPS_ALLOW_STAGING_SEED must be 1");
  }

  if (databaseUrlLooksProductionLike(input.databaseUrl)) {
    throw new Error("DATABASE_URL looks like production");
  }

  if (isStagingSeedMode(input.mode)) {
    if (input.env.CLIENTOPS_SEED_TARGET !== "staging") {
      throw new Error("CLIENTOPS_SEED_TARGET must be staging");
    }
    return;
  }

  if (input.env.CLIENTOPS_SEED_TARGET !== "local") {
    throw new Error("CLIENTOPS_SEED_TARGET must be local");
  }

  if (input.env.CLIENTOPS_DESTRUCTIVE_RESET !== CLIENTOPS_DESTRUCTIVE_RESET_CONFIRMATION) {
    throw new Error(
      `CLIENTOPS_DESTRUCTIVE_RESET must be ${CLIENTOPS_DESTRUCTIVE_RESET_CONFIRMATION}`,
    );
  }
}

export function addDaysToDateString(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function noonIso(dateString: string) {
  return `${dateString}T12:00:00.000Z`;
}

export function buildSeedDates(today = new Date().toISOString().slice(0, 10)) {
  return {
    today,
    overdueRenewal: addDaysToDateString(today, -10),
    renewal30: addDaysToDateString(today, 21),
    renewal60: addDaysToDateString(today, 52),
    renewal90: addDaysToDateString(today, 84),
    renewalLater: addDaysToDateString(today, 150),
    recentTouch: noonIso(addDaysToDateString(today, -4)),
    staleTouch: noonIso(addDaysToDateString(today, -40)),
    oldStart: addDaysToDateString(today, -100),
    recentStart: addDaysToDateString(today, -10),
    overdueTask: addDaysToDateString(today, -4),
    futureTask: addDaysToDateString(today, 7),
  };
}
