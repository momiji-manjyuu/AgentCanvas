import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DiagramPatchOp } from "@agent-canvas/core";
import { createAgentCanvasTools, VERSION } from "./tools.js";

export function createServer(workspacePath: string): McpServer {
  const server = new McpServer({
    name: "agent-canvas",
    version: VERSION,
  });
  const tools = createAgentCanvasTools(workspacePath);

  server.tool("workspace_get_info", {}, async () => toText(await tools.workspace_get_info({})));
  server.tool("workspace_list_diagrams", {}, async () => toText(await tools.workspace_list_diagrams({})));
  server.tool(
    "diagram_fetch",
    { diagramId: z.string() },
    async (input) => toText(await tools.diagram_fetch(input)),
  );
  server.tool(
    "diagram_export_mermaid",
    { diagramId: z.string() },
    async (input) => toText(await tools.diagram_export_mermaid(input)),
  );
  server.tool(
    "diagram_import_mermaid",
    { title: z.string(), source: z.string(), slug: z.string().optional() },
    async (input) =>
      toText(
        await tools.diagram_import_mermaid({
          title: input.title,
          source: input.source,
          ...(input.slug ? { slug: input.slug } : {}),
        }),
      ),
  );
  server.tool(
    "diagram_propose_patch",
    {
      diagramId: z.string(),
      title: z.string(),
      summary: z.string(),
      ops: z.array(z.unknown()),
      risks: z.array(z.string()).optional(),
      rationale: z.string().optional(),
    },
    async (input) =>
      toText(
        await tools.diagram_propose_patch({
          diagramId: input.diagramId,
          title: input.title,
          summary: input.summary,
          ops: input.ops as DiagramPatchOp[],
          ...(input.risks ? { risks: input.risks } : {}),
          ...(input.rationale ? { rationale: input.rationale } : {}),
        }),
      ),
  );
  server.tool(
    "diagram_preview_patch",
    { diagramId: z.string(), ops: z.array(z.unknown()) },
    async (input) =>
      toText(
        await tools.diagram_preview_patch({
          diagramId: input.diagramId,
          ops: input.ops as DiagramPatchOp[],
        }),
      ),
  );
  server.tool(
    "diagram_apply_proposal",
    { diagramId: z.string(), proposalId: z.string() },
    async (input) => toText(await tools.diagram_apply_proposal(input)),
  );
  server.tool(
    "diagram_reject_proposal",
    { diagramId: z.string(), proposalId: z.string() },
    async (input) => toText(await tools.diagram_reject_proposal(input)),
  );
  server.tool(
    "diagram_detect_drift",
    { diagramId: z.string() },
    async (input) => toText(await tools.diagram_detect_drift(input)),
  );
  server.tool(
    "repo_scan",
    { include: z.array(z.string()).optional() },
    async (input) => toText(await tools.repo_scan(input.include ? { include: input.include } : {})),
  );
  server.tool("workspace_git_status", {}, async () => toText(await tools.workspace_git_status({})));

  return server;
}

function toText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
