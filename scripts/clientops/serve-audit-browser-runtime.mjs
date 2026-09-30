/* Local audit runner only. Uses ws from the current frozen dependency graph. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { WebSocketServer, WebSocket } from "ws";
import { neonConfig } from "@neondatabase/serverless";
import assert from "node:assert/strict";
const c = JSON.parse(readFileSync(".clientops-perf/uat/private-config.json")),
  sha = process.argv[2];
assert.equal(c.projectId, "polished-forest-15724329");
assert.equal(c.branchId, "br-solitary-butterfly-b3883kwo");
assert.equal(
  createHash("sha256").update(new URL(c.authUrl).origin).digest("hex"),
  "97b089a053f3c9844ea598a8f061b6c5b5abec7c6d64e0700644f6daec1901f1",
  "Confirmed independent UAT auth origin required",
);
assert.match(sha, /^[0-9a-f]{40}$/);
const appRoot = resolve(process.argv[3] ?? process.cwd());
assert.equal(
  execFileSync("git", ["-C", appRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sha,
);
execFileSync("git", ["-C", appRoot, "diff", "--quiet"]);
execFileSync("git", ["-C", appRoot, "diff", "--cached", "--quiet"]);
process.env.DATABASE_URL =
  "postgres://clientops:clientops_disposable@127.0.0.1:56489/clientops_perf_r06_20260930";
process.env.NEON_AUTH_URL = c.authUrl;
process.env.VERCEL_GIT_COMMIT_SHA = sha;
process.env.NODE_ENV = "production";
process.env.CLIENTOPS_PERF_TOKEN = readFileSync(
  ".clientops-perf/r06/diagnostic-token.private.txt",
  "utf8",
);
for (const key of Object.keys(process.env))
  if (/N8N|OPENROUTER|SUPABASE|CLIENTOPS_SEED|BOOTSTRAP/.test(key)) delete process.env[key];
const wsHttp = createServer((_, res) => {
    res.statusCode = 404;
    res.end();
  }),
  wss = new WebSocketServer({ noServer: true }),
  sockets = new Set();
wsHttp.on("upgrade", (req, socket, head) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname !== "/v1" || u.searchParams.get("address") !== "127.0.0.1:56489") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
});
wss.on("connection", (ws) => {
  const tcp = createConnection({ host: "127.0.0.1", port: 56489 });
  sockets.add(tcp);
  const close = () => {
    tcp.destroy();
    if (ws.readyState < 2) ws.close();
    sockets.delete(tcp);
  };
  ws.on("message", (data) => tcp.write(data));
  tcp.on("data", (data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data, { binary: true });
  });
  ws.on("error", close);
  tcp.on("error", close);
  ws.on("close", close);
  tcp.on("close", close);
});
await new Promise((r) => wsHttp.listen(0, "127.0.0.1", r));
const wsPort = wsHttp.address().port;
neonConfig.webSocketConstructor = WebSocket;
neonConfig.wsProxy = () => `127.0.0.1:${wsPort}/v1?address=127.0.0.1:56489`;
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineConnect = false;
neonConfig.forceDisablePgSSL = true;
const app = (await import(pathToFileURL(resolve(appRoot, "dist/server/server.js")).href)).default,
  assets = resolve(appRoot, "dist/client"),
  cache = new Map(),
  mime = {
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".woff2": "font/woff2",
  };
const http = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end("Read-only measurement");
      return;
    }
    const u = new URL(req.url, "http://localhost:5199");
    if (
      u.pathname.startsWith("/api/") &&
      u.pathname !== "/api/build" &&
      !u.pathname.startsWith("/api/auth/")
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    const file = resolve(assets, "." + decodeURIComponent(u.pathname));
    if (file.startsWith(assets + sep)) {
      if (existsSync(file) && statSync(file).isFile()) {
        let raw = cache.get(file);
        if (!raw) {
          raw = readFileSync(file);
          cache.set(file, raw);
        }
        const compress =
          /gzip/.test(req.headers["accept-encoding"] ?? "") &&
          [".js", ".css", ".svg"].includes(extname(file));
        const body = compress ? gzipSync(raw) : raw;
        res.writeHead(200, {
          "content-type": mime[extname(file)] ?? "application/octet-stream",
          "cache-control": "public,max-age=31536000,immutable",
          ...(compress ? { "content-encoding": "gzip", vary: "accept-encoding" } : {}),
          "content-length": body.length,
        });
        res.end(req.method === "HEAD" ? undefined : body);
        return;
      }
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const response = await app.fetch(new Request(u, { method: req.method, headers }));
    const body = Buffer.from(await response.arrayBuffer());
    const out = Object.fromEntries(response.headers);
    res.writeHead(response.status, out);
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (e) {
    console.error(JSON.stringify({ kind: "appError", name: e.name, code: e.code ?? null }));
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Measurement server error");
  }
});
await new Promise((r) => http.listen(5199, "127.0.0.1", r));
console.log(
  JSON.stringify({
    baseUrl: "http://localhost:5199",
    sha,
    dataset: "clientops_perf_r06_20260930",
    appMode: "production SSR",
    databaseTransport: "real Postgres over loopback WebSocket/TCP",
    methodGuard: "GET/HEAD only",
  }),
);
const stop = () => {
  http.close();
  for (const tcp of sockets) tcp.destroy();
  wss.close();
  wsHttp.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
