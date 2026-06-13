import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    bundle: "src/index.ts",
  },
  outDir: "dist",
  format: ["cjs"],
  platform: "node",
  target: "node22",
  bundle: true,
  clean: false,
  sourcemap: false,
  dts: false,
  noExternal: ["@agent-canvas/core", "@modelcontextprotocol/sdk"],
  outExtension: () => ({ js: ".cjs" }),
});
