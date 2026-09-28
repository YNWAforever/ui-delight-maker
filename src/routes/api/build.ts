import { createFileRoute } from "@tanstack/react-router";
import { readPublicBuildMetadata } from "@/server/build-metadata.server";

export const Route = createFileRoute("/api/build")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(readPublicBuildMetadata(), {
          headers: { "cache-control": "no-store" },
        }),
    },
  },
});
