import type {
  Transport,
  TransportSendOptions,
} from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/** How long one dispatch may wait for the server's response before the request fails. */
const DISPATCH_TIMEOUT_MS = 5_000;

type PendingResponse = {
  resolve: (message: JSONRPCMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** `1` and `"1"` are different JSON-RPC ids, so the pending map keeps the type in the key. */
function idKey(id: string | number): string {
  return `${typeof id}:${id}`;
}

/**
 * Stateless request/response transport for the HTTP MCP endpoint.
 *
 * One instance serves exactly one JSON-RPC message: `dispatch` hands it to the SDK server and
 * resolves with the single response the server emits. There is no socket, no SSE stream and no
 * session — server-initiated requests and notifications are dropped because no client is
 * connected to read them on a single POST.
 */
export class McpRequestTransport implements Transport {
  onclose?: () => void;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: (<T extends JSONRPCMessage>(message: T) => void) | undefined;
  sessionId?: string | undefined;

  private readonly pending = new Map<string, PendingResponse>();
  private closed = false;

  async start(): Promise<void> {
    // Nothing to open: the message arrives through `dispatch`, not through a connection.
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if ("method" in message) return; // server-initiated request/notification: no client to answer
    const id = message.id;
    if (typeof id !== "string" && typeof id !== "number") return;
    const key = idKey(id);
    const pending = this.pending.get(key);
    if (!pending) return;
    this.pending.delete(key);
    clearTimeout(pending.timer);
    pending.resolve(message);
  }

  /**
   * Feeds one incoming message to the server.
   *
   * Resolves with the response for a request and `null` for a notification (nothing expects a
   * reply). Rejects when the server closes or does not answer in time.
   */
  dispatch(message: JSONRPCMessage): Promise<JSONRPCMessage | null> {
    if (this.closed) return Promise.reject(new Error("MCP transport is closed"));
    if (!("method" in message) || !("id" in message)) {
      // A notification: deliver it and report that no reply is expected.
      this.onmessage?.(message);
      return Promise.resolve(null);
    }

    const id = message.id;
    if (typeof id !== "string" && typeof id !== "number") {
      return Promise.reject(new Error("MCP transport received a request without an id"));
    }

    const key = idKey(id);
    return new Promise<JSONRPCMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error("MCP server did not respond in time"));
      }, DISPATCH_TIMEOUT_MS);
      this.pending.set(key, { resolve, reject, timer });
      try {
        this.onmessage?.(message);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(key);
        reject(error instanceof Error ? error : new Error("MCP server rejected the message"));
      }
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("MCP transport closed"));
    }
    this.pending.clear();
    this.onclose?.();
  }
}
