// vite.config.ts
// @lovable.dev/vite-tanstack-config already includes tanstackStart, viteReact,
// tailwindcss, tsConfigPaths, componentTagger, VITE_* injection, @ path alias.
// Do NOT add those manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

function clientopsVendorChunk(id: string) {
  const moduleId = id.replaceAll("\\", "/");
  if (
    moduleId.endsWith("/src/components/reports/report-charts.tsx") ||
    moduleId.includes("/node_modules/recharts/") ||
    moduleId.includes("/node_modules/d3-") ||
    moduleId.includes("/node_modules/victory-vendor/")
  ) {
    return "vendor-charts";
  }
  return undefined;
}

export default defineConfig({
  vite: {
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks: clientopsVendorChunk,
          onlyExplicitManualChunks: true,
        },
      },
    },
  },
  nitro: false,
  tanstackStart: {
    server: { preset: "vercel" },
  },
});
