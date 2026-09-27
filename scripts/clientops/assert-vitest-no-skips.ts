import { readFileSync } from "node:fs";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("Usage: bun scripts/clientops/assert-vitest-no-skips.ts <vitest-json-report>");
  process.exit(2);
}

type VitestSummary = {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  success?: boolean;
};

const report = JSON.parse(readFileSync(reportPath, "utf8")) as VitestSummary;
const total = report.numTotalTests;
const passed = report.numPassedTests;
const failed = report.numFailedTests;
const skipped = report.numPendingTests;
if (
  !Number.isInteger(total) ||
  !Number.isInteger(passed) ||
  !Number.isInteger(failed) ||
  !Number.isInteger(skipped) ||
  total! <= 0 ||
  failed !== 0 ||
  skipped !== 0 ||
  passed !== total ||
  report.success !== true
) {
  console.error(
    "Database contract gate failed: total=" +
      String(total) +
      " passed=" +
      String(passed) +
      " failed=" +
      String(failed) +
      " skipped=" +
      String(skipped),
  );
  process.exit(1);
}
console.log("Database contract gate passed: " + String(passed) + " tests, 0 skipped");
