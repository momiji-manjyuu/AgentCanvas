import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  addProposal,
  applyProposal,
  createSampleWorkspace,
  detectDrift,
  diagramIdFromSlug,
  DiagramPatchOpSchema,
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
  uniqueDiagramId,
  uniqueDiagramSlug,
  type DiagramPatchOp,
} from "@agent-canvas/core";

const execFileAsync = promisify(execFile);

export const VERSION = "0.1.0";

export const DiagramPatchOpsInputSchema = DiagramPatchOpSchema.array();

export interface AgentCanvasTools {
  workspace_get_info(input: Record<string, never>): Promise<unknown>;
  workspace_list_diagrams(input: Record<string, never>): Promise<unknown>;
  workspace_create_sample(input: Record<string, never>): Promise<unknown>;
  diagram_fetch(input: { diagramId: string }): Promise<unknown>;
  diagram_export_mermaid(input: { diagramId: string }): Promise<unknown>;
  diagram_import_mermaid(input: { title: string; source: string; slug?: string }): Promise<unknown>;
  diagram_propose_patch(input: {
    diagramId: string;
    title: string;
    summary: string;
    ops: unknown;
    risks?: string[];
    rationale?: string;
  }): Promise<unknown>;
  diagram_preview_patch(input: { diagramId: string; ops: unknown }): Promise<unknown>;
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
      const diagrams = await listDiagrams(root);
      return {
        ok: true,
        workspacePath: root,
        diagramCount: diagrams.length,
        appVersion: VERSION,
      };
    },

    async workspace_list_diagrams() {
      const diagrams = await listDiagrams(root);
      return {
        ok: true,
        diagrams: diagrams.map((diagram) => ({
          id: diagram.id,
          title: diagram.title,
          path: diagram.path,
          updatedAt: diagram.updatedAt,
        })),
      };
    },

    async workspace_create_sample() {
      const diagram = await createSampleWorkspace(root);
      return {
        ok: true,
        diagram,
      };
    },

    async diagram_fetch(input) {
      return {
        ok: true,
        diagram: await loadDiagram(root, input.diagramId),
      };
    },

    async diagram_export_mermaid(input) {
      const diagram = await loadDiagram(root, input.diagramId);
      return {
        ok: true,
        mermaid: exportMermaid(diagram),
      };
    },

    async diagram_import_mermaid(input) {
      const slug = await uniqueDiagramSlug(root, input.slug ?? slugify(input.title));
      const id = await uniqueDiagramId(root, diagramIdFromSlug(slug));
      const document = importMermaid(input.source, {
        title: input.title,
        slug,
        id,
      });
      await saveDiagramBundle(root, document, slug);
      return {
        ok: true,
        diagram: document,
        slug,
      };
    },

    async diagram_propose_patch(input) {
      const document = await loadDiagram(root, input.diagramId);
      const parsedOps = parsePatchOps(input.ops);
      if (!parsedOps.ok) {
        return parsedOps;
      }
      const preview = previewPatch(document, parsedOps.ops);
      if (!preview.validation.ok) {
        return {
          ok: false,
          errors: preview.validation.errors,
        };
      }
      const proposal = {
        id: `proposal.${slugify(input.title)}.${Date.now()}`,
        title: input.title,
        summary: input.summary,
        author: "agent",
        ops: parsedOps.ops,
        ...(input.risks ? { risks: input.risks } : {}),
        ...(input.rationale ? { rationale: input.rationale } : {}),
      };
      const next = addProposal(document, proposal);
      await saveDiagramBundle(root, next);
      return {
        ok: true,
        proposal: next.proposals.at(-1),
      };
    },

    async diagram_preview_patch(input) {
      const document = await loadDiagram(root, input.diagramId);
      const parsedOps = parsePatchOps(input.ops);
      if (!parsedOps.ok) {
        return parsedOps;
      }
      const preview = previewPatch(document, parsedOps.ops);
      return {
        ok: preview.validation.ok,
        ...(preview.validation.ok ? preview : { errors: preview.validation.errors }),
      };
    },

    async diagram_apply_proposal(input) {
      if (process.env.AGENTCANVAS_ALLOW_MCP_APPLY !== "1") {
        return {
          ok: false,
          applied: false,
          errors: ["proposalは作成済み。アプリで承認してください"],
        };
      }
      const document = await loadDiagram(root, input.diagramId);
      const next = applyProposal(document, input.proposalId);
      await saveDiagramBundle(root, next);
      return {
        ok: true,
        applied: true,
        diagram: next,
      };
    },

    async diagram_reject_proposal(input) {
      const document = await loadDiagram(root, input.diagramId);
      const next = rejectProposal(document, input.proposalId);
      await saveDiagramBundle(root, next);
      return {
        ok: true,
        rejected: true,
        diagram: next,
      };
    },

    async diagram_detect_drift(input) {
      const document = await loadDiagram(root, input.diagramId);
      return {
        ok: true,
        ...(await detectDrift(root, document)),
      };
    },

    async repo_scan(input) {
      try {
        return {
          ok: true,
          ...(await scanRepo(root, input.include ? { include: input.include } : {})),
        };
      } catch (error) {
        return {
          ok: false,
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }
    },

    async workspace_git_status() {
      return {
        ok: true,
        git: await gitStatus(root),
      };
    },
  };
}

function parsePatchOps(ops: unknown): { ok: true; ops: DiagramPatchOp[] } | { ok: false; errors: string[] } {
  const parsed = DiagramPatchOpsInputSchema.safeParse(ops);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "ops"}: ${issue.message}`),
    };
  }
  return { ok: true, ops: parsed.data };
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
