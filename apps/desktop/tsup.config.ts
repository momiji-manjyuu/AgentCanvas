import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      "main/main": "src/main/main.ts",
    },
    outDir: "dist",
    format: ["esm"],
    platform: "node",
    target: "node22",
    bundle: true,
    clean: false,
    sourcemap: true,
    dts: false,
    external: ["electron"],
    noExternal: ["@agent-canvas/core"],
  },
  {
    entry: {
      "preload/preload": "src/preload/preload.ts",
    },
    outDir: "dist",
    format: ["cjs"],
    platform: "node",
    target: "node22",
    bundle: true,
    clean: false,
    sourcemap: true,
    dts: false,
    external: ["electron"],
    outExtension: () => ({ js: ".js" }),
  },
]);
