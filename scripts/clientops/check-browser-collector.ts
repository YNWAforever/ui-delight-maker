import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { collectBrowserSamples } from "./measure-browser-runtime.ts";

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
let providerHits = 0;
const provider = createServer((_req, res) => {
  providerHits++;
  res.end("unexpected");
});
provider.on("upgrade", (_request, socket) => {
  providerHits++;
  socket.destroy();
});
const providerUrl = await listen(provider);
const visits: string[] = [];
const scriptHits = { boot: 0, lazy: 0 };
let mutationHits = 0;
const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (req.method === "POST") {
    mutationHits++;
    res.end("unexpected");
    return;
  }
  if (path === "/worker.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(
      `fetch('${providerUrl}/worker-provider').catch(() => {}).finally(() => postMessage('done'));`,
    );
    return;
  }
  if (path === "/boot.js") {
    scriptHits.boot++;
    res.setHeader("Content-Type", "text/javascript");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end("import('/lazy.js').then(m => m.start());");
    return;
  }
  if (path === "/lazy.js") {
    scriptHits.lazy++;
    res.setHeader("Content-Type", "text/javascript");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(
      `export async function start() { if(location.pathname === '/unsafe') await Promise.allSettled([fetch('/mutation',{method:'POST'}),fetch('${providerUrl}/provider'),new Promise(resolve => { const w=new Worker('/worker.js'); w.onmessage=()=>{w.terminate();resolve(null);}; }),new Promise(resolve => { const ws=new WebSocket('${providerUrl}'.replace('http:','ws:')+'/socket'); ws.onerror=()=>resolve(null); ws.onopen=()=>{ws.close();resolve(null);}; })]); await (await fetch('/data')).json(); document.querySelector('main').dataset.ready='true'; }`,
    );
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  if (path !== "/missing-metrics") {
    res.setHeader("x-clientops-db-scope", "http-request");
    res.setHeader("x-clientops-db-count", path === "/data" ? "2" : "1");
    res.setHeader("x-clientops-db-duration-ms", path === "/data" ? "3" : "2");
    res.setHeader("x-clientops-db-failed", "0");
  }
  if (path === "/data") {
    assert.equal(req.headers["x-clientops-perf-token"], "probe-only");
    visits.push(req.headers.cookie ?? "");
    const count = Number(/probe_visit=(\d+)/.exec(req.headers.cookie ?? "")?.[1] ?? 0) + 1;
    res.setHeader("Set-Cookie", `probe_visit=${count}; Path=/; SameSite=Lax`);
    res.setHeader("Content-Type", "application/json");
    res.end('{"ready":true}');
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html><body><main>Loading</main><script type="module" src="/boot.js"></script></body></html>',
  );
});
const baseUrl = await listen(server);
try {
  const config = {
    baseUrl,
    readySelector: 'main[data-ready="true"]',
    token: "probe-only",
    timeoutMs: 10000,
  };
  const result = await collectBrowserSamples({
    ...config,
    route: "/work",
    coldSamples: 2,
    warmSamples: 2,
  });
  assert.equal(result.samples.length, 4);
  assert.deepEqual(
    result.samples.map((sample) => sample.kind),
    ["cold", "cold", "warm", "warm"],
  );
  assert.deepEqual(visits, ["", "", "", "probe_visit=1", "probe_visit=2"]);
  assert.equal(scriptHits.boot, 3, "warm navigations must preserve browser cache");
  assert.equal(scriptHits.lazy, 3, "lazy modules must remain cached in the warm context");
  for (const sample of result.samples) {
    assert.equal(sample.documentStatus, 200);
    assert.equal(sample.pathMatches, true);
    assert.equal(sample.dataResponses, 2);
    assert.equal(sample.measuredResponses, 2);
    assert.equal(sample.dbCount, 3);
    assert.equal(sample.dbDurationMs, 5);
    assert.equal(sample.failedRequests, 0);
    assert.equal(sample.blockedRequests, 0);
    assert(sample.scriptCount >= 2);
    assert(sample.jsEncodedBytes > 0);
    assert(sample.payloadBytes > 0);
    assert(sample.readyMs > 0);
  }
  assert(
    result.samples
      .filter((sample) => sample.kind === "warm")
      .every((sample) => sample.jsTransferBytes === 0),
  );
  const missing = await collectBrowserSamples({
    ...config,
    route: "/missing-metrics",
    coldSamples: 1,
    warmSamples: 0,
  });
  assert.equal(missing.samples[0].dataResponses, 2);
  assert.equal(missing.samples[0].measuredResponses, 1);
  const unsafe = await collectBrowserSamples({
    ...config,
    route: "/unsafe",
    coldSamples: 1,
    warmSamples: 0,
  });
  assert(unsafe.samples[0].blockedRequests >= 4);
  assert.equal(mutationHits, 0);
  assert.equal(providerHits, 0);
  await assert.rejects(
    collectBrowserSamples({ ...config, route: "/unsafe", coldSamples: 0, warmSamples: 1 }),
    /warm-up/i,
  );
  console.log(
    "Browser collector integration passed: real Chromium navigation, cold isolation, warm cache, lazy JS, request metrics, missing metrics, and network guards. Synthetic local server only; no ClientOps performance acceptance claimed.",
  );
} finally {
  await close(server);
  await close(provider);
}
