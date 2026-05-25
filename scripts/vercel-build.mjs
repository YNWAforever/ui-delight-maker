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
const bundleOut = resolve(FUNC_DIR, "server.mjs");

// Bundle to ESM format.
//
// Why ESM and not CJS:
//   The Vite SSR output has a circular dependency — route chunk assets import
//   `createServerFn` back from server.js. In CJS, the entry point's exports
//   object is partially populated when chunks first run, so createServerFn
//   is undefined at initialisation time. ESM lazy-bindings handle the circle
//   correctly: the binding is resolved at first USE, not at import time.
//
// --platform=node automatically externalises all Node.js built-ins, so no
// explicit --external:node:* flags are needed.
console.log("Bundling dist/server/server.js → server.mjs (ESM) ...");
execFileSync(
  esbuild,
  [
    serverEntry,
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${bundleOut}`,
  ],
  { stdio: "inherit", cwd: root }
);
console.log("✓ Server bundle created (ESM)");

// CJS handler — Vercel Node.js runtime calls (req, res) style.
// Convert IncomingMessage → Web Fetch Request, then pipe Response → res.
//
// server.mjs is an ESM bundle; CJS cannot require() ESM, so we use a
// top-level dynamic import() promise that resolves before the first
// request arrives (warm path) or inside the handler (cold path).
writeFileSync(
  resolve(FUNC_DIR, "handler.js"),
  `'use strict';
// Start loading the ESM bundle immediately — resolves before the first
// request in most cases (Vercel pre-warms functions).
let importErr = null;
const serverPromise = import('./server.mjs')
  .then(m => m.default)
  .catch(e => {
    importErr = e;
    console.error('[handler] server.mjs load failed:', e.stack || e.message);
    return null;
  });

module.exports = async (req, res) => {
  const server = await serverPromise;

  // Module-load failure — return a diagnostic JSON error
  if (!server || importErr) {
    const err = importErr || new Error('server module returned null');
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ phase: 'module_load', error: err.message, stack: err.stack }, null, 2));
    return;
  }

  // Build absolute URL from Node.js IncomingMessage
  const host = req.headers['host'] || 'localhost';
  const url = new URL(req.url, 'https://' + host);

  // Lightweight debug probe (no SSR needed)
  if (url.pathname === '/_debug') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      requestUrl: req.url,
      absoluteUrl: url.href,
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL || '(missing)',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'set' : '(missing)',
        NODE_ENV: process.env.NODE_ENV,
      },
    }, null, 2));
    return;
  }

  // ── Convert IncomingMessage → Web Fetch Request ──────────────────────────
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (Array.isArray(val)) {
      val.forEach(v => headers.append(key, v));
    } else if (val != null) {
      headers.set(key, val);
    }
  }

  let body = undefined;
  if (!['GET', 'HEAD'].includes(req.method)) {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  const fetchRequest = new Request(url.href, {
    method: req.method,
    headers,
    body: body && body.length > 0 ? body : undefined,
  });

  // ── Call SSR handler ─────────────────────────────────────────────────────
  let fetchResponse;
  try {
    fetchResponse = await server.fetch(fetchRequest);
  } catch (err) {
    console.error('[handler] SSR error:', err.stack || err.message);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ phase: 'request', error: err.message, stack: err.stack }, null, 2));
    return;
  }

  // ── Pipe Web Fetch Response → Node.js ServerResponse ────────────────────
  res.statusCode = fetchResponse.status;
  fetchResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (fetchResponse.body) {
    const reader = fetchResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
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
