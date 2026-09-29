import { createServer, request, type IncomingHttpHeaders } from "node:http";

/** Read-only local proxy also covers worker traffic and WebSocket/HTTPS tunnels. */
export async function startBrowserReadOnlyProxy(origin: string) {
  const guard = { blocked: 0 };
  const server = createServer((incoming, outgoing) => {
    let target: URL;
    try {
      target = new URL(incoming.url ?? "");
    } catch {
      guard.blocked++;
      outgoing.writeHead(403);
      outgoing.end();
      return;
    }
    if (
      target.origin !== origin ||
      target.protocol !== "http:" ||
      target.username ||
      target.password ||
      !["GET", "HEAD"].includes(incoming.method ?? "")
    ) {
      guard.blocked++;
      incoming.resume();
      outgoing.writeHead(403);
      outgoing.end();
      return;
    }
    const headers: IncomingHttpHeaders = { ...incoming.headers, host: target.host };
    delete headers["proxy-connection"];
    const upstream = request(target, { method: incoming.method, headers }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    upstream.setTimeout(15000, () => upstream.destroy());
    incoming.on("aborted", () => upstream.destroy());
    upstream.end();
  });
  const rejectTunnel = (_request: unknown, socket: import("node:stream").Duplex) => {
    guard.blocked++;
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  };
  server.on("connect", rejectTunnel);
  server.on("upgrade", rejectTunnel);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Local measurement proxy unavailable");
  return {
    guard,
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
