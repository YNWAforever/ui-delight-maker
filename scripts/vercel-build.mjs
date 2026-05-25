#!/usr/bin/env node
/**
 * Post-build script: assembles the Vercel Build Output API (v3) structure from
 * the vite build output in dist/.
 *
 * dist/client/**   → .vercel/output/static/
 * dist/server/**   → .vercel/output/functions/index.func/ (bundled SSR handler)
 *
 * Docs: https://vercel.com/docs/build-output-api/v3
 */

import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const VERCEL_OUTPUT = resolve(root, ".vercel", "output");
const STATIC_DIR = resolve(VERCEL_OUTPUT, "static");
const FUNC_DIR = resolve(VERCEL_OUTPUT, "functions", "index.func");

// ── 1. Static files ────────────────────────────────────────────────────────
console.log("Copying dist/client → .vercel/output/static ...");
mkdirSync(STATIC_DIR, { recursive: true });
cpSync(resolve(root, "dist", "client"), STATIC_DIR, { recursive: true });

// ── 2. Serverless function ────────────────────────────────────────────────
console.log("Creating .vercel/output/functions/index.func ...");
mkdirSync(FUNC_DIR, { recursive: true });

// Bundle server.js + all npm deps into a single self-contained ESM file
// so the Vercel function has no missing module dependencies at runtime.
const esbuild = resolve(root, "node_modules", ".bin", "esbuild");
const serverEntry = resolve(root, "dist", "server", "server.js");
const bundleOut = resolve(FUNC_DIR, "server.js");

console.log("Bundling dist/server/server.js with esbuild ...");
execSync(
  [
    esbuild,
    serverEntry,
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${bundleOut}`,
    // Keep Node.js built-ins external (they're always available at runtime)
    "--external:node:*",
    "--external:async_hooks",
    "--external:buffer",
    "--external:crypto",
    "--external:events",
    "--external:fs",
    "--external:http",
    "--external:https",
    "--external:net",
    "--external:os",
    "--external:path",
    "--external:stream",
    "--external:string_decoder",
    "--external:tls",
    "--external:url",
    "--external:util",
    "--external:zlib",
  ].join(" "),
  { stdio: "inherit", cwd: root }
);
console.log("✓ Server bundle created");

// Write the function entry-point that wraps the TanStack Start server
writeFileSync(
  resolve(FUNC_DIR, "handler.mjs"),
  `import server from './server.js';
export default (request) => server.fetch(request);
`
);

// package.json so Node.js treats .js files as ESM (server.js uses import/export)
writeFileSync(
  resolve(FUNC_DIR, "package.json"),
  JSON.stringify({ type: "module" }, null, 2)
);

// .vc-config.json tells Vercel this is a Node.js function using Web Fetch API
writeFileSync(
  resolve(FUNC_DIR, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "handler.mjs",
      launcherType: "Nodejs",
      supportsResponseStreaming: true,
    },
    null,
    2
  )
);

// ── 3. Routing config ─────────────────────────────────────────────────────
console.log("Writing .vercel/output/config.json ...");
writeFileSync(
  resolve(VERCEL_OUTPUT, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // Cache hashed static assets forever
        {
          src: "/assets/(.+)",
          headers: { "cache-control": "public, max-age=31536000, immutable" },
          continue: true,
        },
        // Serve existing static files directly
        { handle: "filesystem" },
        // Fall through everything else to the SSR function
        { src: "/(.*)", dest: "/index" },
      ],
    },
    null,
    2
  )
);

console.log("✓ Vercel Build Output API structure created");
