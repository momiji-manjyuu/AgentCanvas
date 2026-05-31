#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const workspacePath = parseWorkspacePath(process.argv.slice(2));
const server = createServer(workspacePath);
const transport = new StdioServerTransport();

await server.connect(transport);

function parseWorkspacePath(args: string[]): string {
  const explicitIndex = args.findIndex((arg) => arg === "--workspace" || arg === "-w");
  const explicitValue = explicitIndex === -1 ? undefined : args[explicitIndex + 1];
  if (explicitValue) {
    return explicitValue;
  }
  if (process.env.AGENTCANVAS_WORKSPACE) {
    return process.env.AGENTCANVAS_WORKSPACE;
  }
  return process.cwd();
}
