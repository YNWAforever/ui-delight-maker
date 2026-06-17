// vite.config.ts
// @lovable.dev/vite-tanstack-config already includes tanstackStart, viteReact,
// tailwindcss, tsConfigPaths, componentTagger, VITE_* injection, @ path alias.
// Do NOT add those manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    server: { preset: "vercel" },
  },
});
