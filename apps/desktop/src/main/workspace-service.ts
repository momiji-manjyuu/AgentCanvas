import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app, dialog } from "electron";
import {
  addProposal,
  atomicWrite,
  applyProposal,
  applyProposalPartial,
  autoLayout,
  createEmptyDiagram,
  createRedisCacheProposal,
  createSampleWorkspace,
  computeContentHash,
  detectDrift,
  diagramIdFromSlug,
  ensureWorkspace,
  exportMarkdown,
  exportMermaid,
  importMermaid,
  listDiagrams,
  loadDiagram,
  pathExists,
  previewPatch,
  readDiagramFile,
  rejectProposal,
  resolveWorkspacePath,
  saveDiagramChecked,
  saveDiagramBundle,
  slugify,
  uniqueDiagramId,
  uniqueDiagramSlug,
  type DiagramDocument,
  type DiagramPatchOp,
  type DiagramProposal,
  type PreservedFromDisk,
} from "@agent-canvas/core";
import {
  rememberRecentWorkspace,
  normalizeRecentWorkspaces,
  type RecentWorkspace,
} from "./recent-workspaces.js";
import {
  readSettings,
  saveLocaleSetting,
  type AppLocale,
  type AppSettings,
} from "./settings.js";
import { rememberSelfWrite, startDiagramWatcher } from "./diagram-watcher-bridge.js";

const execFileAsync = promisify(execFile);

export interface WorkspaceSnapshot {
  workspacePath: string;
  workspaceName: string;
  diagrams: Awaited<ReturnType<typeof listDiagrams>>;
  document: DiagramDocument | null;
  contentHash: string | null;
  preservedFromDisk?: PreservedFromDisk | null;
  gitStatus: GitStatusSummary;
  recentWorkspaces: RecentWorkspace[];
}

export interface GitStatusSummary {
  ok: boolean;
  status: string[];
  message?: string;
}

export interface LoadedDiagram {
  document: DiagramDocument;
  contentHash: string;
}

export interface McpSetupInfo {
  serverPath: string;
  workspacePath: string;
  claudeCommand: string;
  jsonConfig: string;
}

export interface ExportFileInput {
  defaultFileName: string;
  content: string;
  encoding: "utf8" | "base64";
  filters?: Array<{ name: string; extensions: string[] }> | undefined;
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
  await rememberWorkspace(currentWorkspacePath);
  await ensureWorkspace(currentWorkspacePath);
  await startDiagramWatcher(currentWorkspacePath);
  return workspaceSnapshot();
}

export async function workspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const workspacePath = requireWorkspace();
  const diagrams = await listDiagrams(workspacePath);
  const loaded = diagrams[0] ? await loadDiagramWithHash(workspacePath, diagrams[0].id) : null;
  return {
    workspacePath,
    workspaceName: path.basename(workspacePath),
    diagrams,
    document: loaded?.document ?? null,
    contentHash: loaded?.contentHash ?? null,
    gitStatus: await getGitStatus(workspacePath),
    recentWorkspaces: await getRecentWorkspaces(),
  };
}

export async function loadWorkspaceDiagram(diagramId: string): Promise<LoadedDiagram> {
  return loadDiagramWithHash(requireWorkspace(), diagramId);
}

export async function createWorkspaceDiagram(title: string): Promise<WorkspaceSnapshot> {
  const workspacePath = requireWorkspace();
  await createEmptyDiagram(workspacePath, title);
  return workspaceSnapshot();
}

export async function saveWorkspaceDiagram(
  document: DiagramDocument,
  baseHash: string | null,
): Promise<WorkspaceSnapshot> {
  const workspacePath = requireWorkspace();
  const checked = await saveDiagramChecked(workspacePath, document, baseHash);
  rememberSelfWrite(checked.result.diagramPath, checked.contentHash);
  const savedDocument = await readDiagramFile(checked.result.diagramPath);
  const snapshot = await workspaceSnapshot();
  return {
    ...snapshot,
    document: savedDocument,
    contentHash: checked.contentHash,
    preservedFromDisk: checked.preservedFromDisk,
  };
}

export async function importWorkspaceMermaid(input: {
  title: string;
  source: string;
  slug?: string;
}): Promise<WorkspaceSnapshot> {
  const workspacePath = requireWorkspace();
  const slug = await uniqueDiagramSlug(workspacePath, input.slug ?? slugify(input.title));
  const id = await uniqueDiagramId(workspacePath, diagramIdFromSlug(slug));
  const document = importMermaid(input.source, { ...input, slug, id });
  const saved = await saveDiagramBundle(workspacePath, document, slug);
  rememberSelfWrite(saved.diagramPath, computeContentHash(await readFile(saved.diagramPath, "utf8")));
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
  opIndexes?: number[],
): Promise<DiagramDocument> {
  if (opIndexes) {
    return applyProposalPartial(document, proposalId, opIndexes);
  }
  return applyProposal(document, proposalId);
}

export async function rejectWorkspaceProposal(
  document: DiagramDocument,
  proposalId: string,
  reviewNote?: string,
): Promise<DiagramDocument> {
  return rejectProposal(document, proposalId, reviewNote);
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

export async function exportFile(input: ExportFileInput): Promise<{ ok: boolean; filePath?: string }> {
  const selected = await dialog.showSaveDialog({
    defaultPath: input.defaultFileName,
    ...(input.filters ? { filters: input.filters } : {}),
  });
  if (selected.canceled || !selected.filePath) {
    return { ok: false };
  }
  await writeFile(selected.filePath, input.content, input.encoding);
  return { ok: true, filePath: selected.filePath };
}

export function getMcpSetupInfo(): McpSetupInfo {
  const workspacePath = requireWorkspace();
  const serverPath = mcpServerPath();
  const jsonConfig = JSON.stringify(
    {
      mcpServers: {
        agentcanvas: {
          command: "node",
          args: [serverPath, "--workspace", workspacePath],
        },
      },
    },
    null,
    2,
  );
  return {
    serverPath,
    workspacePath,
    claudeCommand: `claude mcp add agentcanvas -- node ${quoteShellArg(serverPath)} --workspace ${quoteShellArg(workspacePath)}`,
    jsonConfig,
  };
}

export function proposalSummary(proposal: DiagramProposal): string {
  return `${proposal.title}: ${proposal.ops.length} operation${proposal.ops.length === 1 ? "" : "s"}`;
}

export async function getRecentWorkspaces(): Promise<RecentWorkspace[]> {
  const filePath = recentWorkspacesFile();
  if (!(await pathExists(filePath))) {
    return [];
  }
  let parsed: RecentWorkspace[];
  try {
    const raw = await readFile(filePath, "utf8");
    parsed = normalizeRecentWorkspaces(JSON.parse(raw));
  } catch {
    return [];
  }
  const existing: RecentWorkspace[] = [];
  for (const workspace of parsed) {
    if (await pathExists(workspace.path)) {
      existing.push(workspace);
    }
  }
  return existing;
}

export async function getSettings(): Promise<AppSettings> {
  return readSettings(settingsFile());
}

export async function saveLocale(locale: AppLocale): Promise<AppSettings> {
  return saveLocaleSetting(settingsFile(), locale);
}

async function rememberWorkspace(workspacePath: string): Promise<void> {
  const filePath = recentWorkspacesFile();
  const existing = await getRecentWorkspaces();
  const next = rememberRecentWorkspace(existing, workspacePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await atomicWrite(filePath, `${JSON.stringify(next, null, 2)}\n`);
}

function recentWorkspacesFile(): string {
  return path.join(app.getPath("userData"), "recent-workspaces.json");
}

function settingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function mcpServerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "mcp-server", "bundle.cjs");
  }
  return path.resolve(app.getAppPath(), "..", "..", "packages", "mcp-server", "dist", "index.js");
}

function quoteShellArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function loadDiagramWithHash(workspacePath: string, diagramId: string): Promise<LoadedDiagram> {
  const diagrams = await listDiagrams(workspacePath);
  const match = diagrams.find((diagram) => diagram.id === diagramId || diagram.slug === diagramId);
  if (!match) {
    throw new Error(`Diagram not found: ${diagramId}`);
  }
  const document = await loadDiagram(workspacePath, diagramId);
  const raw = await readFile(match.path, "utf8");
  return {
    document,
    contentHash: computeContentHash(raw),
  };
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
