// src/start.ts
import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { setResponseStatus } from "@tanstack/react-start/server";
import { withServerFunctionErrorStatus } from "@/lib/operations/server-function-error-status";

const functionErrorStatusMiddleware = createMiddleware({ type: "function" }).server(({ next }) =>
  withServerFunctionErrorStatus(next, setResponseStatus),
);

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  return await next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
  functionMiddleware: [functionErrorStatusMiddleware],
}));
