import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  addProposal,
  applyProposal,
  createSampleWorkspace,
  detectDrift,
  exportMermaid,
  importMermaid,
  listDiagrams,
  loadDiagram,
  previewPatch,
  rejectProposal,
  resolveWorkspacePath,
  saveDiagramBundle,
  scanRepo,
  slugify,
  type DiagramPatchOp,
} from "@agent-canvas/core";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export const VERSION = "0.1.0";

export const DiagramPatchOpsInputSchema = z.array(z.unknown()).transform((ops) => ops as DiagramPatchOp[]);

export interface AgentCanvasTools {
  workspace_get_info(input: Record<string, never>): Promise<unknown>;
  workspace_list_diagrams(input: Record<string, never>): Promise<unknown>;
  diagram_fetch(input: { diagramId: string }): Promise<unknown>;
  diagram_export_mermaid(input: { diagramId: string }): Promise<unknown>;
  diagram_import_mermaid(input: { title: string; source: string; slug?: string }): Promise<unknown>;
  diagram_propose_patch(input: {
    diagramId: string;
    title: string;
    summary: string;
    ops: DiagramPatchOp[];
    risks?: string[];
    rationale?: string;
  }): Promise<unknown>;
  diagram_preview_patch(input: { diagramId: string; ops: DiagramPatchOp[] }): Promise<unknown>;
  diagram_apply_proposal(input: { diagramId: string; proposalId: string }): Promise<unknown>;
  diagram_reject_proposal(input: { diagramId: string; proposalId: string }): Promise<unknown>;
  diagram_detect_drift(input: { diagramId: string }): Promise<unknown>;
  repo_scan(input: { include?: string[] }): Promise<unknown>;
  workspace_git_status(input: Record<string, never>): Promise<unknown>;
}

export function createAgentCanvasTools(workspacePath: string): AgentCanvasTools {
  const root = resolveWorkspacePath(workspacePath);

  return {
    async workspace_get_info() {
      await createSampleWorkspaceIfEmpty(root);
      const diagrams = await listDiagrams(root);
      return {
        workspacePath: root,
        diagramCount: diagrams.length,
        appVersion: VERSION,
      };
    },

    async workspace_list_diagrams() {
      await createSampleWorkspaceIfEmpty(root);
      const diagrams = await listDiagrams(root);
      return {
        diagrams: diagrams.map((diagram) => ({
          id: diagram.id,
          title: diagram.title,
          path: diagram.path,
          updatedAt: diagram.updatedAt,
        })),
      };
    },

    async diagram_fetch(input) {
      return {
        diagram: await loadDiagram(root, input.diagramId),
      };
    },

    async diagram_export_mermaid(input) {
      const diagram = await loadDiagram(root, input.diagramId);
      return {
        mermaid: exportMermaid(diagram),
      };
    },

    async diagram_import_mermaid(input) {
      const document = importMermaid(input.source, {
        title: input.title,
        ...(input.slug ? { slug: input.slug } : {}),
      });
      const slug = input.slug ?? slugify(input.title);
      await saveDiagramBundle(root, document, slug);
      return {
        diagram: document,
        slug,
      };
    },

    async diagram_propose_patch(input) {
      const document = await loadDiagram(root, input.diagramId);
      const proposal = {
        id: `proposal.${slugify(input.title)}.${Date.now()}`,
        title: input.title,
        summary: input.summary,
        author: "agent",
        ops: input.ops,
        ...(input.risks ? { risks: input.risks } : {}),
        ...(input.rationale ? { rationale: input.rationale } : {}),
      };
      const next = addProposal(document, proposal);
      await saveDiagramBundle(root, next);
      return {
        proposal: next.proposals.at(-1),
      };
    },

    async diagram_preview_patch(input) {
      const document = await loadDiagram(root, input.diagramId);
      return previewPatch(document, input.ops);
    },

    async diagram_apply_proposal(input) {
      if (process.env.AGENTCANVAS_ALLOW_MCP_APPLY !== "1") {
        return {
          applied: false,
          message: "proposalは作成済み。アプリで承認してください",
        };
      }
      const document = await loadDiagram(root, input.diagramId);
      const next = applyProposal(document, input.proposalId);
      await saveDiagramBundle(root, next);
      return {
        applied: true,
        diagram: next,
      };
    },

    async diagram_reject_proposal(input) {
      const document = await loadDiagram(root, input.diagramId);
      const next = rejectProposal(document, input.proposalId);
      await saveDiagramBundle(root, next);
      return {
        rejected: true,
        diagram: next,
      };
    },

    async diagram_detect_drift(input) {
      const document = await loadDiagram(root, input.diagramId);
      return detectDrift(root, document);
    },

    async repo_scan(input) {
      return scanRepo(root, input.include ? { include: input.include } : {});
    },

    async workspace_git_status() {
      return gitStatus(root);
    },
  };
}

async function createSampleWorkspaceIfEmpty(workspacePath: string): Promise<void> {
  const diagrams = await listDiagrams(workspacePath);
  if (diagrams.length === 0) {
    await createSampleWorkspace(workspacePath);
  }
}

async function gitStatus(workspacePath: string): Promise<{
  ok: boolean;
  status: string[];
  message?: string;
}> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workspacePath, "status", "--short"], {
      windowsHide: true,
    });
    return {
      ok: true,
      status: stdout
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not a git repository/i.test(message)) {
      return { ok: false, status: [], message: "Not a git repository" };
    }
    if (/ENOENT|not recognized/i.test(message)) {
      return { ok: false, status: [], message: "Git is not installed or not on PATH" };
    }
    return { ok: false, status: [], message };
  }
}
