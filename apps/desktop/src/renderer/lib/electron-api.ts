import {
  applyPatch,
  applyProposal,
  applyProposalPartial,
  autoLayout,
  createRedisCacheProposal,
  createSampleDiagram,
  exportMarkdown,
  exportMermaid,
  importMermaid,
  previewPatch,
  rejectProposal,
  SCHEMA_VERSION,
  type DiagramDocument,
  type DiagramPatchOp,
  type DriftResult,
  type PatchPreviewResult,
  type PreservedFromDisk,
} from "@agent-canvas/core";
import type { AgentCanvasBridge } from "../../preload/preload";

export interface DiagramListItem {
  id: string;
  title: string;
  path: string;
  slug: string;
  updatedAt: string;
}

export interface GitStatusSummary {
  ok: boolean;
  status: string[];
  message?: string;
}

export interface RecentWorkspace {
  path: string;
  name: string;
  lastOpenedAt: string;
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
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface WorkspaceSnapshot {
  workspacePath: string;
  workspaceName: string;
  diagrams: DiagramListItem[];
  document: DiagramDocument | null;
  contentHash: string | null;
  preservedFromDisk?: PreservedFromDisk | null;
  gitStatus: GitStatusSummary;
  recentWorkspaces: RecentWorkspace[];
}

export interface LoadedDiagram {
  document: DiagramDocument;
  contentHash: string;
}

export type ExternalDiagramChange =
  | {
      kind: "created" | "changed";
      path: string;
      slug: string;
      diagramId: string;
      document: DiagramDocument;
      contentHash: string;
    }
  | {
      kind: "removed";
      path: string;
      slug: string;
    }
  | {
      kind: "invalid";
      path: string;
      slug: string;
      error: string;
    };

export interface AgentCanvasApi {
  openWorkspace(): Promise<WorkspaceSnapshot | null>;
  openWorkspacePath(workspacePath: string): Promise<WorkspaceSnapshot>;
  getRecentWorkspaces(): Promise<RecentWorkspace[]>;
  getMcpSetupInfo(): Promise<McpSetupInfo>;
  createEmptyWorkspace(): Promise<WorkspaceSnapshot | null>;
  createSampleWorkspace(): Promise<WorkspaceSnapshot>;
  loadDiagram(diagramId: string): Promise<LoadedDiagram>;
  createDiagram(title: string): Promise<WorkspaceSnapshot>;
  saveDiagram(document: DiagramDocument, baseHash: string | null): Promise<WorkspaceSnapshot>;
  importMermaid(input: { title: string; source: string; slug?: string }): Promise<WorkspaceSnapshot>;
  exportMermaid(document: DiagramDocument): Promise<string>;
  exportMarkdown(document: DiagramDocument): Promise<string>;
  exportFile(input: ExportFileInput): Promise<{ ok: boolean; filePath?: string }>;
  autoLayout(document: DiagramDocument): Promise<DiagramDocument>;
  createSampleProposal(document: DiagramDocument): Promise<DiagramDocument>;
  previewProposal(document: DiagramDocument, ops: DiagramPatchOp[]): Promise<PatchPreviewResult>;
  applyProposal(document: DiagramDocument, proposalId: string, opIndexes?: number[]): Promise<DiagramDocument>;
  rejectProposal(document: DiagramDocument, proposalId: string, reviewNote?: string): Promise<DiagramDocument>;
  detectDrift(document: DiagramDocument): Promise<DriftResult>;
  onExternalChange(callback: (event: ExternalDiagramChange) => void): () => void;
}

declare global {
  interface Window {
    agentCanvas?: AgentCanvasBridge;
  }
}

let fallbackDocument = createSampleDiagram();
let fallbackContentHash = "browser-preview-0";

const fallbackApi: AgentCanvasApi = {
  async openWorkspace() {
    return sampleSnapshot();
  },
  async openWorkspacePath() {
    return sampleSnapshot();
  },
  async getRecentWorkspaces() {
    return [];
  },
  async getMcpSetupInfo() {
    return {
      serverPath: "browser-preview/packages/mcp-server/dist/index.js",
      workspacePath: "browser-preview",
      claudeCommand:
        'claude mcp add agentcanvas -- node "browser-preview/packages/mcp-server/dist/index.js" --workspace "browser-preview"',
      jsonConfig: JSON.stringify(
        {
          mcpServers: {
            agentcanvas: {
              command: "node",
              args: ["browser-preview/packages/mcp-server/dist/index.js", "--workspace", "browser-preview"],
            },
          },
        },
        null,
        2,
      ),
    };
  },
  async createEmptyWorkspace() {
    fallbackDocument = await createEmptyDiagramLike("Untitled Diagram");
    touchFallbackContentHash();
    return sampleSnapshot();
  },
  async createSampleWorkspace() {
    fallbackDocument = createSampleDiagram();
    touchFallbackContentHash();
    return sampleSnapshot();
  },
  async loadDiagram() {
    return { document: fallbackDocument, contentHash: fallbackContentHash };
  },
  async createDiagram(title: string) {
    fallbackDocument = await createEmptyDiagramLike(title);
    touchFallbackContentHash();
    return sampleSnapshot();
  },
  async saveDiagram(document: DiagramDocument) {
    fallbackDocument = document;
    touchFallbackContentHash();
    return sampleSnapshot();
  },
  async importMermaid(input) {
    fallbackDocument = importMermaid(input.source, input);
    touchFallbackContentHash();
    return sampleSnapshot();
  },
  async exportMermaid(document) {
    return exportMermaid(document);
  },
  async exportMarkdown(document) {
    return exportMarkdown(document);
  },
  async exportFile() {
    return { ok: true };
  },
  async autoLayout(document) {
    fallbackDocument = autoLayout(document);
    return fallbackDocument;
  },
  async createSampleProposal(document) {
    const proposal = createRedisCacheProposal(document);
    fallbackDocument = {
      ...document,
      proposals: [...document.proposals, proposal],
      updatedAt: new Date().toISOString(),
    };
    return fallbackDocument;
  },
  async previewProposal(document, ops) {
    return previewPatch(document, ops);
  },
  async applyProposal(document, proposalId, opIndexes) {
    fallbackDocument = opIndexes
      ? applyProposalPartial(document, proposalId, opIndexes)
      : applyProposal(document, proposalId);
    return fallbackDocument;
  },
  async rejectProposal(document, proposalId, reviewNote) {
    fallbackDocument = rejectProposal(document, proposalId, reviewNote);
    return fallbackDocument;
  },
  async detectDrift() {
    return { issues: [], scan: { files: [], packageManifests: [], symbols: [], warnings: [] } };
  },
  onExternalChange() {
    return () => undefined;
  },
};

export function getAgentCanvasApi(): AgentCanvasApi {
  if (!window.agentCanvas && isBrowserPreviewMode()) {
    return fallbackApi;
  }
  if (!window.agentCanvas) {
    return missingBridgeApi;
  }
  return window.agentCanvas as unknown as AgentCanvasApi;
}

export function applyLocalPatch(document: DiagramDocument, ops: DiagramPatchOp[]): DiagramDocument {
  return applyPatch(document, ops);
}

function sampleSnapshot(): WorkspaceSnapshot {
  return {
    workspacePath: "browser-preview",
    workspaceName: "Browser Preview",
    diagrams: [
      {
        id: fallbackDocument.id,
        title: fallbackDocument.title,
        path: "browser-preview/design/diagrams/system-overview.diagram.json",
        slug: "system-overview",
        updatedAt: fallbackDocument.updatedAt,
      },
    ],
    document: fallbackDocument,
    contentHash: fallbackContentHash,
    gitStatus: { ok: false, status: [], message: "Browser preview mode" },
    recentWorkspaces: [],
  };
}

async function createEmptyDiagramLike(title: string): Promise<DiagramDocument> {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `diagram.${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    createdAt: now,
    updatedAt: now,
    direction: "LR",
    nodes: [],
    edges: [],
    groups: [],
    notes: [],
    tasks: [],
    comments: [],
    layout: { nodes: {}, edges: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    proposals: [],
    metadata: { slug: "untitled-diagram" },
  };
}

function touchFallbackContentHash(): void {
  fallbackContentHash = `browser-preview-${Date.now()}`;
}

export function isBrowserPreviewMode(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_AGENTCANVAS_BROWSER_PREVIEW === "1";
}

export function isAgentCanvasBridgeUnavailable(): boolean {
  return !window.agentCanvas && !isBrowserPreviewMode();
}

const missingBridgeApi = new Proxy({} as AgentCanvasApi, {
  get() {
    return async () => {
      throw new Error("Preload/IPC is not initialized. Restart the desktop app or enable browser preview explicitly.");
    };
  },
});
