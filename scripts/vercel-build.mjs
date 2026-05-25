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

import { mkdirSync, cpSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

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

const esbuild = resolve(root, "node_modules", ".bin", "esbuild");
const serverEntry = resolve(root, "dist", "server", "server.js");
const bundleOut = resolve(FUNC_DIR, "server.cjs");

// Bundle to CJS format — no ESM banner/import ordering issues,
// require() works natively for any CJS packages in the dependency tree.
console.log("Bundling dist/server/server.js → server.cjs (CommonJS) ...");
execFileSync(
  esbuild,
  [
    serverEntry,
    "--bundle",
    "--platform=node",
    "--format=cjs",          // CJS: require() works natively, no banner needed
    `--outfile=${bundleOut}`,
    // Keep Node.js built-ins external (always available at runtime)
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
  ],
  { stdio: "inherit", cwd: root }
);
console.log("✓ Server bundle created (CJS)");

// CJS handler — no ESM, require() works directly.
// Uses lazy initialisation so module-load errors surface as JSON 500s.
writeFileSync(
  resolve(FUNC_DIR, "handler.js"),
  `'use strict';
let server = null;
let importErr = null;
try {
  const mod = require('./server.cjs');
  // esbuild CJS output puts the default export on .default
  server = mod.default || mod;
} catch (e) {
  importErr = e;
  console.error('[handler] server.cjs load failed:', e.stack || e.message);
}

module.exports = async (request) => {
  if (importErr) {
    return new Response(
      JSON.stringify({ phase: 'module_load', error: importErr.message, stack: importErr.stack }, null, 2),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const host = request.headers.get('host') || 'localhost';
  const base = 'https://' + host;
  const url = new URL(request.url.startsWith('http') ? request.url : base + request.url);

  if (url.pathname === '/_debug') {
    return new Response(JSON.stringify({
      ok: true, requestUrl: request.url, absoluteUrl: url.href,
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL || '(missing)',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'set' : '(missing)',
        NODE_ENV: process.env.NODE_ENV,
      },
    }, null, 2), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  const absoluteRequest = new Request(url.href, {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  });

  try {
    return await server.fetch(absoluteRequest);
  } catch (err) {
    console.error('[handler] SSR error:', err.stack || err.message);
    return new Response(
      JSON.stringify({ phase: 'request', error: err.message, stack: err.stack }, null, 2),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
};
`
);

// No package.json needed — without type:module, .js defaults to CJS
// .vc-config.json tells Vercel this is a Node.js Web Fetch API function
writeFileSync(
  resolve(FUNC_DIR, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "handler.js",
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
        {
          src: "/assets/(.+)",
          headers: { "cache-control": "public, max-age=31536000, immutable" },
          continue: true,
        },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index" },
      ],
    },
    null,
    2
  )
);

console.log("✓ Vercel Build Output API structure created");
