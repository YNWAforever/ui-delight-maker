import { getDeploySeedDecision } from "../../src/lib/clientops-seed";

const decision = getDeploySeedDecision(process.env);

if (decision.shouldSeed === false) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: true,
        reason: decision.reason,
      },
      null,
      2,
    ),
  );
} else {
  Object.assign(process.env, decision.env);
  await import("./seed-smoke-data");
}
