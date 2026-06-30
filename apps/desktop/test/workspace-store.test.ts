import { afterEach, describe, expect, it, vi } from "vitest";
import { createSampleDiagram, type DiagramDocument } from "@agent-canvas/core";
import type {
  AgentCanvasApi,
  AppSettings,
  ExportFileInput,
  LoadedDiagram,
  McpSetupInfo,
  RecentWorkspace,
  WorkspaceSnapshot,
} from "../src/renderer/lib/electron-api";

const workspacePath = "/tmp/agent-canvas-workspace";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("workspace store collaboration state", () => {
  it("applies external targeted agent comments to the open diagram while preserving node selection", async () => {
    const { useWorkspaceStore } = await importWorkspaceStore();
    const document = createSampleDiagram();
    const selection = { kind: "node" as const, id: "node.redis_cache" };
    const agentComment = {
      id: "comment.agent.live",
      text: "Verify cache fallback behavior.",
      author: "agent",
      authorKind: "agent" as const,
      targetId: selection.id,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    const changedDocument: DiagramDocument = {
      ...document,
      comments: [...document.comments, agentComment],
      updatedAt: new Date().toISOString(),
    };

    useWorkspaceStore.setState({
      workspacePath,
      workspaceName: "agent-canvas-workspace",
      document,
      baseHash: "hash.before",
      selection,
      dirty: false,
    });

    useWorkspaceStore.getState().handleExternalChange({
      kind: "changed",
      path: `${workspacePath}/design/diagrams/system-overview.diagram.json`,
      slug: "system-overview",
      diagramId: document.id,
      document: changedDocument,
      contentHash: "hash.after",
    });

    const state = useWorkspaceStore.getState();
    expect(state.document?.comments).toContainEqual(agentComment);
    expect(
      state.document?.comments.filter((comment) => comment.targetId === selection.id),
    ).toHaveLength(1);
    expect(state.selection).toEqual(selection);
    expect(state.baseHash).toBe("hash.after");
    expect(state.activity.some((item) => item.kind === "comment")).toBe(true);
  });

  it("keeps the current selection after saving the same diagram", async () => {
    const document = createSampleDiagram();
    const selection = { kind: "node" as const, id: "node.auth_service" };
    const saveDiagram = vi.fn(async (savedDocument: DiagramDocument) =>
      snapshot(savedDocument, "hash.saved"),
    );
    const { useWorkspaceStore } = await importWorkspaceStore({ saveDiagram });

    useWorkspaceStore.setState({
      workspacePath,
      workspaceName: "agent-canvas-workspace",
      document,
      baseHash: "hash.before",
      selection,
      dirty: true,
    });

    await useWorkspaceStore.getState().save();

    expect(saveDiagram).toHaveBeenCalledWith(document, "hash.before");
    expect(useWorkspaceStore.getState().selection).toEqual(selection);
    expect(useWorkspaceStore.getState().dirty).toBe(false);
    expect(useWorkspaceStore.getState().baseHash).toBe("hash.saved");
  });
});

async function importWorkspaceStore(apiOverrides: Partial<AgentCanvasApi> = {}) {
  const api = mockApi(apiOverrides);
  vi.stubGlobal("navigator", { language: "en-US" });
  vi.stubGlobal("window", {
    agentCanvas: api,
    confirm: vi.fn(() => true),
  });
  return import("../src/renderer/state/workspace-store");
}

function mockApi(overrides: Partial<AgentCanvasApi>): AgentCanvasApi {
  const document = createSampleDiagram();
  const api: AgentCanvasApi = {
    openWorkspace: vi.fn(async () => snapshot(document)),
    openWorkspacePath: vi.fn(async () => snapshot(document)),
    getRecentWorkspaces: vi.fn(async (): Promise<RecentWorkspace[]> => []),
    getMcpSetupInfo: vi.fn(
      async (): Promise<McpSetupInfo> => ({
        serverPath: "/tmp/agent-canvas-mcp",
        workspacePath,
        claudeCommand:
          "claude mcp add agentcanvas -- node /tmp/agent-canvas-mcp --workspace /tmp/agent-canvas-workspace",
        jsonConfig: "{}",
      }),
    ),
    getSettings: vi.fn(async (): Promise<AppSettings> => ({ locale: "en" })),
    setLocale: vi.fn(async (locale): Promise<AppSettings> => ({ locale })),
    createEmptyWorkspace: vi.fn(async () => snapshot(document)),
    createSampleWorkspace: vi.fn(async () => snapshot(document)),
    loadDiagram: vi.fn(
      async (): Promise<LoadedDiagram> => ({
        document,
        contentHash: "hash.loaded",
      }),
    ),
    createDiagram: vi.fn(async () => snapshot(document)),
    saveDiagram: vi.fn(async (savedDocument) => snapshot(savedDocument, "hash.saved")),
    importMermaid: vi.fn(async () => snapshot(document)),
    exportMermaid: vi.fn(async () => "flowchart LR\n"),
    exportMarkdown: vi.fn(async () => "# Diagram\n"),
    exportFile: vi.fn(async (_input: ExportFileInput) => ({ ok: true })),
    autoLayout: vi.fn(async (inputDocument) => inputDocument),
    createSampleProposal: vi.fn(async (inputDocument) => inputDocument),
    previewProposal: vi.fn(async (inputDocument) => ({
      document: inputDocument,
      validation: { ok: true, errors: [] },
      diff: { added: [], removed: [], changed: [] },
    })),
    applyProposal: vi.fn(async (inputDocument) => inputDocument),
    rejectProposal: vi.fn(async (inputDocument) => inputDocument),
    detectDrift: vi.fn(async () => ({
      issues: [],
      scan: { files: [], packageManifests: [], symbols: [], warnings: [] },
    })),
    onExternalChange: vi.fn(() => () => undefined),
    ...overrides,
  };
  return api;
}

function snapshot(document: DiagramDocument, contentHash = "hash.current"): WorkspaceSnapshot {
  return {
    workspacePath,
    workspaceName: "agent-canvas-workspace",
    diagrams: [
      {
        id: document.id,
        title: document.title,
        path: `${workspacePath}/design/diagrams/system-overview.diagram.json`,
        slug: "system-overview",
        updatedAt: document.updatedAt,
      },
    ],
    document,
    contentHash,
    gitStatus: { ok: true, status: [] },
    recentWorkspaces: [],
  };
}
