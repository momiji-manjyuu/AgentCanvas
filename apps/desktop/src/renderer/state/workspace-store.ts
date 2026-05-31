import { create } from "zustand";
import {
  type DiagramDocument,
  type DiagramEdgeArrow,
  type DiagramEdgeType,
  type DiagramNodeType,
  type DiagramPatchOp,
  type DriftResult,
  type PatchPreviewResult,
} from "@agent-canvas/core";
import {
  applyLocalPatch,
  getAgentCanvasApi,
  type DiagramListItem,
  type GitStatusSummary,
  type RecentWorkspace,
  type WorkspaceSnapshot,
} from "../lib/electron-api";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "note"; id: string }
  | { kind: "task"; id: string }
  | { kind: "comment"; id: string };

interface WorkspaceState {
  workspacePath: string | null;
  workspaceName: string | null;
  diagrams: DiagramListItem[];
  document: DiagramDocument | null;
  gitStatus: GitStatusSummary | null;
  recentWorkspaces: RecentWorkspace[];
  selection: Selection | null;
  preview: PatchPreviewResult | null;
  activeProposalId: string | null;
  drift: DriftResult | null;
  toast: string | null;
  lastError: string | null;
  busy: boolean;
  dirty: boolean;
  past: DiagramDocument[];
  future: DiagramDocument[];
  openWorkspace(): Promise<void>;
  openRecentWorkspace(workspacePath: string): Promise<void>;
  loadRecentWorkspaces(): Promise<void>;
  createSampleWorkspace(): Promise<void>;
  createEmptyWorkspace(): Promise<void>;
  loadDiagram(diagramId: string): Promise<void>;
  createDiagram(title: string): Promise<void>;
  save(): Promise<void>;
  importMermaid(title: string, source: string): Promise<void>;
  autoLayout(): Promise<void>;
  createSampleProposal(): Promise<void>;
  previewProposal(proposalId: string): Promise<void>;
  clearPreview(): void;
  acceptProposal(proposalId: string): Promise<void>;
  rejectProposal(proposalId: string): Promise<void>;
  detectDrift(): Promise<void>;
  select(selection: Selection | null): void;
  addNode(type?: DiagramNodeType, position?: { x: number; y: number }): void;
  updateNode(id: string, updates: Partial<DiagramDocument["nodes"][number]>): void;
  moveNode(id: string, x: number, y: number): void;
  deleteSelection(selection: Selection): void;
  deleteSelected(): void;
  addEdge(
    from: string,
    to: string,
    options?: { sourceHandle?: string | null; targetHandle?: string | null },
  ): void;
  updateEdge(id: string, updates: Partial<DiagramDocument["edges"][number]>): void;
  addTask(targetId: string | undefined, title: string): void;
  updateTask(id: string, updates: Partial<DiagramDocument["tasks"][number]>): void;
  addNote(targetId: string | undefined, text: string): void;
  addComment(targetId: string | undefined, text: string): void;
  resolveComment(id: string): void;
  undo(): void;
  redo(): void;
  dismissToast(): void;
}

type StoreSet = (
  partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>),
) => void;
type StoreGet = () => WorkspaceState;

const api = getAgentCanvasApi();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspacePath: null,
  workspaceName: null,
  diagrams: [],
  document: null,
  gitStatus: null,
  recentWorkspaces: [],
  selection: null,
  preview: null,
  activeProposalId: null,
  drift: null,
  toast: null,
  lastError: null,
  busy: false,
  dirty: false,
  past: [],
  future: [],

  async openWorkspace() {
    await run(set, async () => {
      const snapshot = await api.openWorkspace();
      if (snapshot) {
        applySnapshot(set, snapshot);
      }
    });
  },

  async openRecentWorkspace(workspacePath: string) {
    await run(set, async () => applySnapshot(set, await api.openWorkspacePath(workspacePath)));
  },

  async loadRecentWorkspaces() {
    try {
      set({ recentWorkspaces: await api.getRecentWorkspaces() });
    } catch {
      set({ recentWorkspaces: [] });
    }
  },

  async createSampleWorkspace() {
    await run(set, async () => applySnapshot(set, await api.createSampleWorkspace()));
  },

  async createEmptyWorkspace() {
    await run(set, async () => {
      const snapshot = await api.createEmptyWorkspace();
      if (snapshot) {
        applySnapshot(set, snapshot);
      }
    });
  },

  async loadDiagram(diagramId: string) {
    await run(set, async () => {
      const document = await api.loadDiagram(diagramId);
      set({
        document,
        selection: null,
        preview: null,
        activeProposalId: null,
        past: [],
        future: [],
      });
    });
  },

  async createDiagram(title: string) {
    await run(set, async () => applySnapshot(set, await api.createDiagram(title)));
  },

  async save() {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () => {
      const snapshot = await api.saveDiagram(document);
      applySnapshot(set, snapshot, document);
      set({ toast: "Saved diagram, Mermaid, and Markdown exports", dirty: false });
    });
  },

  async importMermaid(title: string, source: string) {
    await run(set, async () => {
      const snapshot = await api.importMermaid({ title, source });
      applySnapshot(set, snapshot);
      const unsupported = snapshot.document?.metadata.unsupportedMermaidLines;
      const unsupportedCount = Array.isArray(unsupported)
        ? unsupported.filter((line) => typeof line === "string").length
        : 0;
      set({
        toast: unsupportedCount
          ? `Imported Mermaid with ${unsupportedCount} unsupported line${unsupportedCount === 1 ? "" : "s"}`
          : "Imported Mermaid as Diagram IR",
      });
    });
  },

  async autoLayout() {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () =>
      commit(set, get, await api.autoLayout(document), "Auto layout applied"),
    );
  },

  async createSampleProposal() {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () => {
      const next = await api.createSampleProposal(document);
      commit(set, get, next, "Sample proposal created");
    });
  },

  async previewProposal(proposalId: string) {
    const document = get().document;
    const proposal = document?.proposals.find((item) => item.id === proposalId);
    if (!document || !proposal) {
      return;
    }
    await run(set, async () => {
      const preview = await api.previewProposal(document, proposal.ops);
      set({ preview, activeProposalId: proposalId });
    });
  },

  clearPreview() {
    set({ preview: null, activeProposalId: null });
  },

  async acceptProposal(proposalId: string) {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () => {
      const next = await api.applyProposal(document, proposalId);
      const snapshot = await api.saveDiagram(next);
      applySnapshot(set, snapshot, next);
      set({ preview: null, activeProposalId: null, toast: "Proposal accepted", dirty: false });
    });
  },

  async rejectProposal(proposalId: string) {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () => {
      const next = await api.rejectProposal(document, proposalId);
      const snapshot = await api.saveDiagram(next);
      applySnapshot(set, snapshot, next);
      set({ preview: null, activeProposalId: null, toast: "Proposal rejected", dirty: false });
    });
  },

  async detectDrift() {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () => {
      const drift = await api.detectDrift(document);
      set({
        drift,
        toast: `Detected ${drift.issues.length} drift issue${drift.issues.length === 1 ? "" : "s"}`,
      });
    });
  },

  select(selection) {
    if (isSameSelection(get().selection, selection)) {
      return;
    }
    set({ selection });
  },

  addNode(type = "service", position) {
    const document = get().document;
    if (!document) {
      return;
    }
    const id = uniqueId(
      document.nodes.map((node) => node.id),
      `node.${type}`,
    );
    const op: DiagramPatchOp = {
      op: "add_node",
      node: {
        id,
        type,
        label: titleCase(type),
        codeRefs: [],
        tags: [],
        metadata: {},
      },
      layout: {
        x: position?.x ?? 120 + document.nodes.length * 24,
        y: position?.y ?? 120 + document.nodes.length * 18,
        width: 190,
        height: 76,
      },
    };
    commit(set, get, applyLocalPatch(document, [op]), "Node added");
    set({ selection: { kind: "node", id } });
  },

  updateNode(id, updates) {
    const document = get().document;
    if (!document) {
      return;
    }
    commit(
      set,
      get,
      applyLocalPatch(document, [{ op: "update_node", id, updates }]),
      "Node updated",
    );
  },

  moveNode(id, x, y) {
    const document = get().document;
    if (!document) {
      return;
    }
    commit(set, get, applyLocalPatch(document, [{ op: "move_node", id, position: { x, y } }]));
  },

  deleteSelection(selection) {
    const { document } = get();
    if (!document) {
      return;
    }
    const op = deletionOp(selection);
    commit(set, get, applyLocalPatch(document, [op]), "Selection deleted");
    set({ selection: null });
  },

  deleteSelected() {
    const { selection } = get();
    if (!selection) {
      return;
    }
    get().deleteSelection(selection);
  },

  addEdge(from, to, options) {
    const document = get().document;
    if (!document || from === to) {
      return;
    }
    const id = uniqueId(
      document.edges.map((edge) => edge.id),
      `edge.${from}.${to}`,
    );
    const metadata: Record<string, unknown> = { pathKind: "smoothstep" };
    if (options?.sourceHandle) {
      metadata.sourceHandle = options.sourceHandle;
    }
    if (options?.targetHandle) {
      metadata.targetHandle = options.targetHandle;
    }
    commit(
      set,
      get,
      applyLocalPatch(document, [
        {
          op: "add_edge",
          edge: { id, from, to, label: "calls", type: "sync", arrow: "directed", metadata },
        },
      ]),
      "Edge added",
    );
    set({ selection: { kind: "edge", id } });
  },

  updateEdge(id, updates) {
    const document = get().document;
    if (!document) {
      return;
    }
    commit(
      set,
      get,
      applyLocalPatch(document, [{ op: "update_edge", id, updates }]),
      "Edge updated",
    );
  },

  addTask(targetId, title) {
    const document = get().document;
    if (!document || !title.trim()) {
      return;
    }
    commit(
      set,
      get,
      applyLocalPatch(document, [
        {
          op: "add_task",
          task: {
            id: uniqueId(
              document.tasks.map((task) => task.id),
              "task.todo",
            ),
            title: title.trim(),
            status: "todo",
            ...(targetId ? { targetId } : {}),
          },
        },
      ]),
      "Task added",
    );
  },

  updateTask(id, updates) {
    const document = get().document;
    if (!document) {
      return;
    }
    commit(
      set,
      get,
      applyLocalPatch(document, [{ op: "update_task", id, updates }]),
      "Task updated",
    );
  },

  addNote(targetId, text) {
    const document = get().document;
    if (!document || !text.trim()) {
      return;
    }
    commit(
      set,
      get,
      applyLocalPatch(document, [
        {
          op: "add_note",
          note: {
            id: uniqueId(
              document.notes.map((note) => note.id),
              "note.local",
            ),
            text: text.trim(),
            kind: "note",
            ...(targetId ? { targetId } : {}),
          },
        },
      ]),
      "Note added",
    );
  },

  addComment(targetId, text) {
    const document = get().document;
    if (!document || !text.trim()) {
      return;
    }
    commit(
      set,
      get,
      applyLocalPatch(document, [
        {
          op: "add_comment",
          comment: {
            id: uniqueId(
              document.comments.map((comment) => comment.id),
              "comment.user",
            ),
            text: text.trim(),
            author: "user",
            resolved: false,
            createdAt: new Date().toISOString(),
            ...(targetId ? { targetId } : {}),
          },
        },
      ]),
      "Comment added",
    );
  },

  resolveComment(id) {
    const document = get().document;
    if (!document) {
      return;
    }
    commit(
      set,
      get,
      applyLocalPatch(document, [{ op: "resolve_comment", id }]),
      "Comment resolved",
    );
  },

  undo() {
    const { past, document, future } = get();
    const previous = past.at(-1);
    if (!previous || !document) {
      return;
    }
    set({
      document: previous,
      past: past.slice(0, -1),
      future: [document, ...future],
      preview: null,
      activeProposalId: null,
      toast: "Undo",
    });
  },

  redo() {
    const { future, document, past } = get();
    const next = future[0];
    if (!next || !document) {
      return;
    }
    set({
      document: next,
      past: [...past, document],
      future: future.slice(1),
      preview: null,
      activeProposalId: null,
      toast: "Redo",
    });
  },

  dismissToast() {
    set({ toast: null });
  },
}));

function applySnapshot(
  set: StoreSet,
  snapshot: WorkspaceSnapshot,
  documentOverride?: DiagramDocument,
): void {
  set({
    workspacePath: snapshot.workspacePath,
    workspaceName: snapshot.workspaceName,
    diagrams: snapshot.diagrams,
    document: documentOverride ?? snapshot.document,
    gitStatus: snapshot.gitStatus,
    recentWorkspaces: snapshot.recentWorkspaces,
    selection: null,
    preview: null,
    activeProposalId: null,
    past: [],
    future: [],
    dirty: false,
    lastError: null,
  });
}

async function run(set: StoreSet, action: () => Promise<void>): Promise<void> {
  set({ busy: true, toast: null, lastError: null });
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    set({ toast: message, lastError: message });
  } finally {
    set({ busy: false });
  }
}

function commit(set: StoreSet, get: StoreGet, document: DiagramDocument, toast?: string): void {
  const current = get().document;
  set({
    document,
    past: current ? [...get().past, current] : get().past,
    future: [],
    preview: null,
    activeProposalId: null,
    ...(toast ? { toast } : {}),
    dirty: true,
  });
}

function deletionOp(selection: Selection): DiagramPatchOp {
  switch (selection.kind) {
    case "node":
      return { op: "delete_node", id: selection.id };
    case "edge":
      return { op: "delete_edge", id: selection.id };
    case "note":
      return { op: "delete_note", id: selection.id };
    case "task":
      return { op: "delete_task", id: selection.id };
    case "comment":
      return { op: "resolve_comment", id: selection.id };
  }
}

function isSameSelection(a: Selection | null, b: Selection | null): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.kind === b.kind && a.id === b.id;
}

function uniqueId(existing: string[], base: string): string {
  const normalized = base.replace(/[^A-Za-z0-9_.:-]+/g, "_");
  if (!existing.includes(normalized)) {
    return normalized;
  }
  let index = 2;
  while (existing.includes(`${normalized}.${index}`)) {
    index += 1;
  }
  return `${normalized}.${index}`;
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export const nodeTypes: DiagramNodeType[] = [
  "actor",
  "service",
  "component",
  "database",
  "cache",
  "queue",
  "external",
  "unknown",
];

export const edgeTypes: DiagramEdgeType[] = [
  "sync",
  "async",
  "dependency",
  "data",
  "control",
  "unknown",
];

export const edgeArrows: Array<{ value: DiagramEdgeArrow; label: string }> = [
  { value: "directed", label: "One-way arrow" },
  { value: "bidirectional", label: "Two-way arrow" },
  { value: "none", label: "Line only" },
];
