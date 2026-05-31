import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { app, dialog } from "electron";
import {
  addProposal,
  applyProposal,
  autoLayout,
  createEmptyDiagram,
  createRedisCacheProposal,
  createSampleWorkspace,
  detectDrift,
  exportMarkdown,
  exportMermaid,
  importMermaid,
  listDiagrams,
  loadDiagram,
  previewPatch,
  rejectProposal,
  resolveWorkspacePath,
  saveDiagramBundle,
  slugify,
  type DiagramDocument,
  type DiagramPatchOp,
  type DiagramProposal,
} from "@agent-canvas/core";

const execFileAsync = promisify(execFile);

export interface WorkspaceSnapshot {
  workspacePath: string;
  workspaceName: string;
  diagrams: Awaited<ReturnType<typeof listDiagrams>>;
  document: DiagramDocument | null;
  gitStatus: GitStatusSummary;
}

export interface GitStatusSummary {
  ok: boolean;
  status: string[];
  message?: string;
}

let currentWorkspacePath: string | null = null;

export async function chooseAndOpenWorkspace(): Promise<WorkspaceSnapshot | null> {
  const selected = await dialog.showOpenDialog({
    title: "Open AgentCanvas Workspace",
    properties: ["openDirectory", "createDirectory"],
  });
  if (selected.canceled || !selected.filePaths[0]) {
    return null;
  }
  return openWorkspace(selected.filePaths[0]);
}

export async function createEmptyWorkspaceFromDialog(): Promise<WorkspaceSnapshot | null> {
  const selected = await dialog.showOpenDialog({
    title: "Choose Empty Workspace Folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (selected.canceled || !selected.filePaths[0]) {
    return null;
  }
  await createEmptyDiagram(selected.filePaths[0], "Untitled Diagram");
  return openWorkspace(selected.filePaths[0]);
}

export async function createSampleWorkspaceInDocuments(): Promise<WorkspaceSnapshot> {
  const target = path.join(app.getPath("documents"), "AgentCanvas Sample Workspace");
  await createSampleWorkspace(target);
  return openWorkspace(target);
}

export async function openWorkspace(workspacePath: string): Promise<WorkspaceSnapshot> {
  currentWorkspacePath = resolveWorkspacePath(workspacePath);
  return workspaceSnapshot();
}

export async function workspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const workspacePath = requireWorkspace();
  const diagrams = await listDiagrams(workspacePath);
  const document = diagrams[0] ? await loadDiagram(workspacePath, diagrams[0].id) : null;
  return {
    workspacePath,
    workspaceName: path.basename(workspacePath),
    diagrams,
    document,
    gitStatus: await getGitStatus(workspacePath),
  };
}

export async function loadWorkspaceDiagram(diagramId: string): Promise<DiagramDocument> {
  return loadDiagram(requireWorkspace(), diagramId);
}

export async function createWorkspaceDiagram(title: string): Promise<WorkspaceSnapshot> {
  const workspacePath = requireWorkspace();
  await createEmptyDiagram(workspacePath, title);
  return workspaceSnapshot();
}

export async function saveWorkspaceDiagram(document: DiagramDocument): Promise<WorkspaceSnapshot> {
  const workspacePath = requireWorkspace();
  await saveDiagramBundle(workspacePath, document);
  const snapshot = await workspaceSnapshot();
  return {
    ...snapshot,
    document,
  };
}

export async function importWorkspaceMermaid(input: {
  title: string;
  source: string;
  slug?: string;
}): Promise<WorkspaceSnapshot> {
  const workspacePath = requireWorkspace();
  const document = importMermaid(input.source, input);
  await saveDiagramBundle(workspacePath, document, input.slug ?? slugify(input.title));
  return {
    ...(await workspaceSnapshot()),
    document,
  };
}

export async function autoLayoutWorkspaceDiagram(document: DiagramDocument): Promise<DiagramDocument> {
  return autoLayout(document);
}

export async function createSampleProposal(document: DiagramDocument): Promise<DiagramDocument> {
  const proposal = createRedisCacheProposal(document);
  return addProposal(document, proposal);
}

export async function previewWorkspacePatch(document: DiagramDocument, ops: DiagramPatchOp[]) {
  return previewPatch(document, ops);
}

export async function applyWorkspaceProposal(
  document: DiagramDocument,
  proposalId: string,
): Promise<DiagramDocument> {
  return applyProposal(document, proposalId);
}

export async function rejectWorkspaceProposal(
  document: DiagramDocument,
  proposalId: string,
): Promise<DiagramDocument> {
  return rejectProposal(document, proposalId);
}

export async function detectWorkspaceDrift(document: DiagramDocument) {
  return detectDrift(requireWorkspace(), document);
}

export function exportWorkspaceMermaid(document: DiagramDocument): string {
  return exportMermaid(document);
}

export function exportWorkspaceMarkdown(document: DiagramDocument): string {
  return exportMarkdown(document);
}

export function proposalSummary(proposal: DiagramProposal): string {
  return `${proposal.title}: ${proposal.ops.length} operation${proposal.ops.length === 1 ? "" : "s"}`;
}

async function getGitStatus(workspacePath: string): Promise<GitStatusSummary> {
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
      return { ok: false, status: [], message: "Git is not installed" };
    }
    return { ok: false, status: [], message };
  }
}

function requireWorkspace(): string {
  if (!currentWorkspacePath) {
    throw new Error("No workspace is open");
  }
  return currentWorkspacePath;
}
