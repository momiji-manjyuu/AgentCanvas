import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSampleWorkspace } from "@agent-canvas/core";
import { createAgentCanvasTools } from "../src/tools.js";

describe("MCP tool handlers", () => {
  it("workspace_list_diagrams returns sample diagram", async () => {
    const workspace = await sampleWorkspace();
    const tools = createAgentCanvasTools(workspace);
    const result = (await tools.workspace_list_diagrams({})) as { diagrams: Array<{ title: string }> };
    expect(result.diagrams.some((diagram) => diagram.title === "System Overview")).toBe(true);
  });

  it("diagram_propose_patch creates a pending proposal", async () => {
    const workspace = await sampleWorkspace();
    const tools = createAgentCanvasTools(workspace);
    const result = (await tools.diagram_propose_patch({
      diagramId: "diagram.system_overview",
      title: "Add Search",
      summary: "Adds a search service.",
      ops: [
        {
          op: "add_node",
          node: {
            id: "node.search",
            type: "service",
            label: "Search Service",
            codeRefs: [],
            tags: [],
            metadata: {},
          },
        },
      ],
    })) as { proposal: { status: string } };
    expect(result.proposal.status).toBe("pending");
  });

  it("diagram_apply_proposal rejects by default without env flag", async () => {
    const workspace = await sampleWorkspace();
    const tools = createAgentCanvasTools(workspace);
    const proposed = (await tools.diagram_propose_patch({
      diagramId: "diagram.system_overview",
      title: "Add Search",
      summary: "Adds a search service.",
      ops: [
        {
          op: "add_node",
          node: {
            id: "node.search",
            type: "service",
            label: "Search Service",
            codeRefs: [],
            tags: [],
            metadata: {},
          },
        },
      ],
    })) as { proposal: { id: string } };
    const result = (await tools.diagram_apply_proposal({
      diagramId: "diagram.system_overview",
      proposalId: proposed.proposal.id,
    })) as { applied: boolean; message: string };
    expect(result.applied).toBe(false);
    expect(result.message).toContain("アプリで承認してください");
  });

  it("diagram_export_mermaid returns a string", async () => {
    const workspace = await sampleWorkspace();
    const tools = createAgentCanvasTools(workspace);
    const result = (await tools.diagram_export_mermaid({
      diagramId: "diagram.system_overview",
    })) as { mermaid: string };
    expect(result.mermaid).toContain("flowchart LR");
  });
});

async function sampleWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-mcp-"));
  await createSampleWorkspace(workspace);
  return workspace;
}
