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

import { mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
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

// ── 1b. Patch dist/server/server.js ───────────────────────────────────────
// TanStack Start v1.167.x: the server bundle's createServerFn only exposes
// .inputValidator() but client-side SSR stubs (included for HTML rendering)
// call .validator() — the client-side API. Add .validator as an alias so the
// same function chain works in both contexts.
const serverJsPath = resolve(root, "dist", "server", "server.js");
let serverJsCode = readFileSync(serverJsPath, "utf8");

const TARGET = `    inputValidator: (inputValidator) => {
      return createServerFn(void 0, {
        ...resolvedOptions,
        inputValidator
      });
    },
    handler:`;

const PATCHED = `    inputValidator: (inputValidator) => {
      return createServerFn(void 0, {
        ...resolvedOptions,
        inputValidator
      });
    },
    // Alias: client-side SSR stubs call .validator(); map it to .inputValidator()
    validator: (validator) => {
      return createServerFn(void 0, {
        ...resolvedOptions,
        inputValidator: validator
      });
    },
    handler:`;

if (!serverJsCode.includes(TARGET)) {
  throw new Error(
    "[vercel-build] Could not find createServerFn.inputValidator pattern to patch — " +
    "check dist/server/server.js for API changes."
  );
}
serverJsCode = serverJsCode.replace(TARGET, PATCHED);
writeFileSync(serverJsPath, serverJsCode, "utf8");
console.log("✓ Patched createServerFn: added .validator() alias for .inputValidator()");

// ── 2. Serverless function ────────────────────────────────────────────────
console.log("Creating .vercel/output/functions/index.func ...");
mkdirSync(FUNC_DIR, { recursive: true });

const esbuild = resolve(root, "node_modules", ".bin", "esbuild");
const serverEntry = resolve(root, "dist", "server", "server.js");
const bundleOut = resolve(FUNC_DIR, "server.cjs");

// Bundle to CJS format.
//
// Why CJS and not ESM:
//   CJS react-dom/server uses require("util") and other Node built-ins. In an
//   ESM bundle, esbuild wraps these in __commonJS shims whose __require helper
//   throws "Dynamic require of X is not supported" at runtime.
//
//   With CJS format, require() works natively and Node built-ins are resolved
//   by the runtime. esbuild still wraps circular deps in __esm lazy-init blocks,
//   so the createServerFn circular dependency is handled correctly.
//
//   We also patch dist/server/server.js before this step to add .validator()
//   as an alias for .inputValidator(), fixing client-side SSR stubs.
//
// --platform=node automatically externalises all Node.js built-ins, so no
// explicit --external:node:* flags are needed.
console.log("Bundling dist/server/server.js → server.cjs (CJS) ...");
execFileSync(
  esbuild,
  [
    serverEntry,
    "--bundle",
    "--platform=node",
    "--format=cjs",
    `--outfile=${bundleOut}`,
  ],
  { stdio: "inherit", cwd: root }
);
console.log("✓ Server bundle created (CJS)");

// CJS handler — Vercel Node.js runtime calls (req, res) style.
// Convert IncomingMessage → Web Fetch Request, then pipe Response → res.
writeFileSync(
  resolve(FUNC_DIR, "handler.js"),
  `'use strict';
// Load the CJS bundle synchronously. This is safe because the bundle is
// self-contained (all deps inlined) and doesn't use top-level await.
let server = null;
let importErr = null;
try {
  server = require('./server.cjs').default;
} catch (e) {
  importErr = e;
  console.error('[handler] server.cjs load failed:', e.stack || e.message);
}

module.exports = async (req, res) => {

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
    // Skip Set-Cookie here — handled separately below to avoid the
    // Headers.forEach() comma-joining bug that corrupts multiple cookies.
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  // Set-Cookie must be passed as an array; using getSetCookie() (Node 18+)
  // preserves each cookie as a separate string instead of joining them.
  if (typeof fetchResponse.headers.getSetCookie === 'function') {
    const cookies = fetchResponse.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader('set-cookie', cookies);
  }

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
