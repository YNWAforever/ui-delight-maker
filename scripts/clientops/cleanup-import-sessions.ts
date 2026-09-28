import { cleanupExpiredImportSessions } from "../../src/server/imports/import-session.server";

if (!process.argv.includes("--execute")) {
  throw new Error("Pass --execute to scrub expired import row payloads");
}

const expiredSessions = await cleanupExpiredImportSessions();
console.log(JSON.stringify({ expiredSessions }));
