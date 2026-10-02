import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { authorizationSsrResponse } from "@/server/http/ssr-authorization-response.server";

const streamHandler = defineHandlerCallback(async (context) => {
  const result = await defaultStreamHandler(context);
  const error = context.router.state.matches.find((match) => match.status === "error")?.error;
  if (result instanceof Response) return authorizationSsrResponse(result, error);
  // Keep the renderer's stream cleanup/dispose contract and the original body intact.
  return { ...result, response: authorizationSsrResponse(result.response, error) };
});

export default createServerEntry({ fetch: createStartHandler(streamHandler) });
