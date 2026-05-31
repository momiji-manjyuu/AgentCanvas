import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSampleWorkspace, loadDiagram, pathExists } from "@agent-canvas/core";
import { createAgentCanvasTools } from "../src/tools.js";

const originalAllowApply = process.env.AGENTCANVAS_ALLOW_MCP_APPLY;

afterEach(() => {
  if (originalAllowApply === undefined) {
    delete process.env.AGENTCANVAS_ALLOW_MCP_APPLY;
  } else {
    process.env.AGENTCANVAS_ALLOW_MCP_APPLY = originalAllowApply;
  }
});

describe("MCP tool handlers", () => {
  it("read tools do not mutate an empty workspace", async () => {
    const workspace = await emptyWorkspace();
    const tools = createAgentCanvasTools(workspace);

    const info = (await tools.workspace_get_info({})) as { ok: boolean; diagramCount: number };
    const list = (await tools.workspace_list_diagrams({})) as { ok: boolean; diagrams: unknown[] };

    expect(info).toMatchObject({ ok: true, diagramCount: 0 });
    expect(list).toMatchObject({ ok: true, diagrams: [] });
    expect(await pathExists(path.join(workspace, "design", "diagrams"))).toBe(false);
  });

  it("workspace_create_sample is the explicit mutating sample tool", async () => {
    const workspace = await emptyWorkspace();
    const tools = createAgentCanvasTools(workspace);

    const result = (await tools.workspace_create_sample({})) as { ok: boolean; diagram: { title: string } };
    expect(result.ok).toBe(true);
    expect(result.diagram.title).toBe("System Overview");
    expect(await readdir(path.join(workspace, "design", "diagrams"))).not.toHaveLength(0);
  });

  it("invalid op shapes are rejected", async () => {
    const workspace = await sampleWorkspace();
    const tools = createAgentCanvasTools(workspace);
    const result = (await tools.diagram_propose_patch({
      diagramId: "diagram.system_overview",
      title: "Bad",
      summary: "Invalid shape.",
      ops: [{ op: "add_node", node: { id: "node.bad" } }],
    })) as { ok: boolean; errors: string[] };

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Required");
  });

  it("missing edge endpoint proposals are rejected and not saved", async () => {
    const workspace = await sampleWorkspace();
    const tools = createAgentCanvasTools(workspace);
    const result = (await tools.diagram_propose_patch({
      diagramId: "diagram.system_overview",
      title: "Bad Edge",
      summary: "Missing endpoint.",
      ops: [
        {
          op: "add_edge",
          edge: {
            id: "edge.bad",
            from: "node.missing",
            to: "node.client",
            type: "sync",
            arrow: "directed",
            metadata: {},
          },
        },
      ],
    })) as { ok: boolean; errors: string[] };
    const diagram = await loadDiagram(workspace, "diagram.system_overview");

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("node not found");
    expect(diagram.proposals).toHaveLength(0);
  });

  it("valid proposals are saved as pending", async () => {
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
    })) as { ok: boolean; proposal: { id: string; status: string } };

    expect(result.ok).toBe(true);
    expect(result.proposal.status).toBe("pending");
    expect((await loadDiagram(workspace, "diagram.system_overview")).proposals).toHaveLength(1);
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
    })) as { ok: boolean; applied: boolean; errors: string[] };
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.errors.join("\n")).toContain("アプリで承認してください");
  });

  it("diagram_apply_proposal applies when the env flag is enabled", async () => {
    process.env.AGENTCANVAS_ALLOW_MCP_APPLY = "1";
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
    })) as { ok: boolean; applied: boolean };
    const diagram = await loadDiagram(workspace, "diagram.system_overview");

    expect(result).toMatchObject({ ok: true, applied: true });
    expect(diagram.nodes.some((node) => node.id === "node.search")).toBe(true);
  });

  it("repo_scan include path traversal is reported as structured error", async () => {
    const workspace = await sampleWorkspace();
    const tools = createAgentCanvasTools(workspace);
    const result = (await tools.repo_scan({ include: ["../secret"] })) as { ok: boolean; errors: string[] };
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("escapes workspace");
  });
});

async function emptyWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "agent-canvas-mcp-"));
}

async function sampleWorkspace(): Promise<string> {
  const workspace = await emptyWorkspace();
  await createSampleWorkspace(workspace);
  return workspace;
}
