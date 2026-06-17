// src/start.ts
import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  return await next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
