import {
  applyPatch,
  applyProposal,
  autoLayout,
  createRedisCacheProposal,
  createSampleDiagram,
  exportMarkdown,
  exportMermaid,
  importMermaid,
  previewPatch,
  rejectProposal,
  type DiagramDocument,
  type DiagramPatchOp,
  type DriftResult,
  type PatchPreviewResult,
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

export interface WorkspaceSnapshot {
  workspacePath: string;
  workspaceName: string;
  diagrams: DiagramListItem[];
  document: DiagramDocument | null;
  gitStatus: GitStatusSummary;
}

export interface AgentCanvasApi {
  openWorkspace(): Promise<WorkspaceSnapshot | null>;
  openWorkspacePath(workspacePath: string): Promise<WorkspaceSnapshot>;
  createEmptyWorkspace(): Promise<WorkspaceSnapshot | null>;
  createSampleWorkspace(): Promise<WorkspaceSnapshot>;
  loadDiagram(diagramId: string): Promise<DiagramDocument>;
  createDiagram(title: string): Promise<WorkspaceSnapshot>;
  saveDiagram(document: DiagramDocument): Promise<WorkspaceSnapshot>;
  importMermaid(input: { title: string; source: string; slug?: string }): Promise<WorkspaceSnapshot>;
  exportMermaid(document: DiagramDocument): Promise<string>;
  exportMarkdown(document: DiagramDocument): Promise<string>;
  autoLayout(document: DiagramDocument): Promise<DiagramDocument>;
  createSampleProposal(document: DiagramDocument): Promise<DiagramDocument>;
  previewProposal(document: DiagramDocument, ops: DiagramPatchOp[]): Promise<PatchPreviewResult>;
  applyProposal(document: DiagramDocument, proposalId: string): Promise<DiagramDocument>;
  rejectProposal(document: DiagramDocument, proposalId: string): Promise<DiagramDocument>;
  detectDrift(document: DiagramDocument): Promise<DriftResult>;
}

declare global {
  interface Window {
    agentCanvas?: AgentCanvasBridge;
  }
}

let fallbackDocument = createSampleDiagram();

const fallbackApi: AgentCanvasApi = {
  async openWorkspace() {
    return sampleSnapshot();
  },
  async openWorkspacePath() {
    return sampleSnapshot();
  },
  async createEmptyWorkspace() {
    fallbackDocument = await createEmptyDiagramLike("Untitled Diagram");
    return sampleSnapshot();
  },
  async createSampleWorkspace() {
    fallbackDocument = createSampleDiagram();
    return sampleSnapshot();
  },
  async loadDiagram() {
    return fallbackDocument;
  },
  async createDiagram(title: string) {
    fallbackDocument = await createEmptyDiagramLike(title);
    return sampleSnapshot();
  },
  async saveDiagram(document: DiagramDocument) {
    fallbackDocument = document;
    return sampleSnapshot();
  },
  async importMermaid(input) {
    fallbackDocument = importMermaid(input.source, input);
    return sampleSnapshot();
  },
  async exportMermaid(document) {
    return exportMermaid(document);
  },
  async exportMarkdown(document) {
    return exportMarkdown(document);
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
  async applyProposal(document, proposalId) {
    fallbackDocument = applyProposal(document, proposalId);
    return fallbackDocument;
  },
  async rejectProposal(document, proposalId) {
    fallbackDocument = rejectProposal(document, proposalId);
    return fallbackDocument;
  },
  async detectDrift() {
    return { issues: [], scan: { files: [], packageManifests: [], symbols: [] } };
  },
};

export function getAgentCanvasApi(): AgentCanvasApi {
  if (!window.agentCanvas) {
    return fallbackApi;
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
    gitStatus: { ok: false, status: [], message: "Browser preview mode" },
  };
}

async function createEmptyDiagramLike(title: string): Promise<DiagramDocument> {
  const now = new Date().toISOString();
  return {
    schemaVersion: "0.1.0",
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
