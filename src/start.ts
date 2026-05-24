// src/start.ts
import { createStart, createMiddleware } from "@tanstack/react-start";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  return await next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
