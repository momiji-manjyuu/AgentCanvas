import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "main/main": "src/main/main.ts",
    "preload/preload": "src/preload/preload.ts",
  },
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  clean: true,
  sourcemap: true,
  dts: false,
  external: ["electron"],
  noExternal: ["@agent-canvas/core"],
});
