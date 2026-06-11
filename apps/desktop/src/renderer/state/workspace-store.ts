import { create } from "zustand";
import {
  type DiagramDocument,
  type DiagramEdgeArrow,
  type DiagramEdgeType,
  type DiagramNodeType,
  type DiagramPatchOp,
  type DriftResult,
  type PatchPreviewResult,
  type PreservedFromDisk,
  mergeExternalChanges,
} from "@agent-canvas/core";
import { t } from "../i18n";
import {
  applyLocalPatch,
  getAgentCanvasApi,
  type DiagramListItem,
  type ExternalDiagramChange,
  type GitStatusSummary,
  type McpSetupInfo,
  type RecentWorkspace,
  type WorkspaceSnapshot,
} from "../lib/electron-api";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "note"; id: string }
  | { kind: "task"; id: string }
  | { kind: "comment"; id: string };

export interface ActivityItem {
  id: string;
  at: string;
  kind: "proposal" | "comment" | "diagram" | "save" | "decision" | "warning";
  message: string;
  diagramId?: string;
  proposalId?: string;
}

interface WorkspaceState {
  workspacePath: string | null;
  workspaceName: string | null;
  diagrams: DiagramListItem[];
  document: DiagramDocument | null;
  baseHash: string | null;
  gitStatus: GitStatusSummary | null;
  recentWorkspaces: RecentWorkspace[];
  mcpSetup: McpSetupInfo | null;
  selection: Selection | null;
  preview: PatchPreviewResult | null;
  activeProposalId: string | null;
  drift: DriftResult | null;
  toast: string | null;
  lastError: string | null;
  activity: ActivityItem[];
  busy: boolean;
  dirty: boolean;
  past: DiagramDocument[];
  future: DiagramDocument[];
  openWorkspace(): Promise<void>;
  openRecentWorkspace(workspacePath: string): Promise<void>;
  loadRecentWorkspaces(): Promise<void>;
  loadMcpSetup(): Promise<void>;
  createSampleWorkspace(): Promise<void>;
  createEmptyWorkspace(): Promise<void>;
  loadDiagram(diagramId: string): Promise<void>;
  reloadDiagram(): Promise<void>;
  handleExternalChange(event: ExternalDiagramChange): void;
  createDiagram(title: string): Promise<void>;
  save(): Promise<void>;
  importMermaid(title: string, source: string): Promise<void>;
  autoLayout(): Promise<void>;
  createSampleProposal(): Promise<void>;
  previewProposal(proposalId: string, opIndexes?: number[]): Promise<void>;
  clearPreview(): void;
  activateProposal(proposalId: string): void;
  acceptProposal(proposalId: string, opIndexes?: number[]): Promise<void>;
  rejectProposal(proposalId: string, reviewNote?: string): Promise<void>;
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
  addComment(targetId: string | undefined, text: string, parentId?: string): void;
  resolveComment(id: string): void;
  undo(): void;
  redo(): void;
  dismissToast(): void;
}

type StoreSet = (
  partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>),
) => void;
type StoreGet = () => WorkspaceState;
type ActivityInput = Omit<ActivityItem, "id" | "at" | "diagramId" | "proposalId"> & {
  diagramId?: string | undefined;
  proposalId?: string | undefined;
};

const api = getAgentCanvasApi();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspacePath: null,
  workspaceName: null,
  diagrams: [],
  document: null,
  baseHash: null,
  gitStatus: null,
  recentWorkspaces: [],
  mcpSetup: null,
  selection: null,
  preview: null,
  activeProposalId: null,
  drift: null,
  toast: null,
  lastError: null,
  activity: [],
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

  async loadMcpSetup() {
    try {
      set({ mcpSetup: await api.getMcpSetupInfo() });
    } catch {
      set({ mcpSetup: null });
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
      const loaded = await api.loadDiagram(diagramId);
      set({
        document: loaded.document,
        baseHash: loaded.contentHash,
        selection: null,
        preview: null,
        activeProposalId: null,
        past: [],
        future: [],
        dirty: false,
      });
    });
  },

  async reloadDiagram() {
    const { document, dirty } = get();
    if (!document) {
      return;
    }
    if (dirty && !window.confirm(t("dialog.reloadDirty"))) {
      return;
    }
    await run(set, async () => {
      const loaded = await api.loadDiagram(document.id);
      set({
        document: loaded.document,
        baseHash: loaded.contentHash,
        selection: null,
        preview: null,
        activeProposalId: null,
        past: [],
        future: [],
        dirty: false,
        toast: t("toast.reload"),
      });
    });
  },

  handleExternalChange(event) {
    const state = get();
    if (event.kind === "invalid") {
      set({ toast: t("toast.externalInvalid", { slug: event.slug }), lastError: event.error });
      addActivity(set, {
        kind: "warning",
        message: t("toast.externalInvalidActivity", { slug: event.slug }),
        diagramId: event.slug,
      });
      return;
    }

    if (event.kind === "removed") {
      set((current) => ({
        diagrams: current.diagrams.filter((diagram) => diagram.slug !== event.slug && diagram.path !== event.path),
        toast: current.document?.metadata.slug === event.slug ? t("activity.diagramRemoved", { slug: event.slug }) : current.toast,
      }));
      addActivity(set, {
        kind: "diagram",
        message: t("activity.diagramRemoved", { slug: event.slug }),
        diagramId: event.slug,
      });
      return;
    }

    addExternalChangeActivity(set, state.document, event);
    set((current) => ({
      diagrams: upsertDiagramListItem(current.diagrams, event),
    }));

    const currentDocument = state.document;
    if (!currentDocument || !isCurrentDiagram(currentDocument, event)) {
      return;
    }

    if (!state.dirty) {
      set({
        document: event.document,
        baseHash: event.contentHash,
        selection: selectionExists(event.document, state.selection) ? state.selection : null,
        preview: null,
        activeProposalId: null,
        past: [],
        future: [],
        dirty: false,
        toast: t("toast.externalChanged"),
      });
      return;
    }

    const merged = mergeExternalChanges(event.document, currentDocument);
    set({
      document: merged.merged,
      baseHash: event.contentHash,
      selection: selectionExists(merged.merged, state.selection) ? state.selection : null,
      past: [...state.past, currentDocument],
      future: [],
      preview: null,
      activeProposalId: null,
      dirty: true,
      toast: preservedToast(merged.preservedFromDisk),
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
      const snapshot = await api.saveDiagram(document, get().baseHash);
      applySnapshot(set, snapshot);
      set({ toast: saveToast(snapshot), dirty: false });
      addActivity(set, {
        kind: "save",
        message: t("activity.saved"),
        diagramId: snapshot.document?.id,
      });
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
          ? t("toast.importedMermaidUnsupported", {
              count: unsupportedCount,
              plural: unsupportedCount === 1 ? "" : "s",
            })
          : t("toast.importedMermaid"),
      });
    });
  },

  async autoLayout() {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () =>
      commit(set, get, await api.autoLayout(document), t("toast.autoLayout")),
    );
  },

  async createSampleProposal() {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () => {
      const next = await api.createSampleProposal(document);
      commit(set, get, next, t("proposal.createdSample"));
      addActivity(set, {
        kind: "proposal",
        message: t("activity.sampleProposal"),
        diagramId: document.id,
        proposalId: next.proposals.at(-1)?.id,
      });
    });
  },

  async previewProposal(proposalId: string, opIndexes?: number[]) {
    const document = get().document;
    const proposal = document?.proposals.find((item) => item.id === proposalId);
    if (!document || !proposal) {
      return;
    }
    await run(set, async () => {
      const ops = opIndexes
        ? opIndexes.flatMap((index) => {
            const op = proposal.ops[index];
            return op ? [op] : [];
          })
        : proposal.ops;
      const preview = await api.previewProposal(document, ops);
      set({ preview, activeProposalId: proposalId });
    });
  },

  clearPreview() {
    set({ preview: null, activeProposalId: null });
  },

  activateProposal(proposalId) {
    set({ activeProposalId: proposalId });
  },

  async acceptProposal(proposalId: string, opIndexes?: number[]) {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () => {
      const next = await api.applyProposal(document, proposalId, opIndexes);
      const snapshot = await api.saveDiagram(next, get().baseHash);
      applySnapshot(set, snapshot);
      set({ preview: null, activeProposalId: null, toast: t("proposal.accepted"), dirty: false });
      addActivity(set, {
        kind: "decision",
        message: t("activity.proposalAccepted", { title: proposalTitle(document, proposalId) }),
        diagramId: document.id,
        proposalId,
      });
    });
  },

  async rejectProposal(proposalId: string, reviewNote?: string) {
    const document = get().document;
    if (!document) {
      return;
    }
    await run(set, async () => {
      const next = await api.rejectProposal(document, proposalId, reviewNote);
      const snapshot = await api.saveDiagram(next, get().baseHash);
      applySnapshot(set, snapshot);
      set({ preview: null, activeProposalId: null, toast: t("proposal.rejected"), dirty: false });
      addActivity(set, {
        kind: "decision",
        message: t("activity.proposalRejected", { title: proposalTitle(document, proposalId) }),
        diagramId: document.id,
        proposalId,
      });
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
        toast: t("toast.detectedDrift", {
          count: drift.issues.length,
          plural: drift.issues.length === 1 ? "" : "s",
        }),
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
    commit(set, get, applyLocalPatch(document, [op]), t("toast.nodeAdded"));
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
      t("toast.nodeUpdated"),
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
    commit(set, get, applyLocalPatch(document, [op]), t("toast.selectionDeleted"));
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
      t("toast.edgeAdded"),
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
      t("toast.edgeUpdated"),
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
      t("toast.taskAdded"),
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
      t("toast.taskUpdated"),
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
      t("toast.noteAdded"),
    );
  },

  addComment(targetId, text, parentId) {
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
            author: "human",
            authorKind: "human",
            resolved: false,
            createdAt: new Date().toISOString(),
            ...(targetId ? { targetId } : {}),
            ...(parentId ? { parentId } : {}),
          },
        },
      ]),
      t("toast.commentAdded"),
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
      t("toast.commentResolved"),
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
      toast: t("toast.undo"),
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
      toast: t("toast.redo"),
    });
  },

  dismissToast() {
    set({ toast: null });
  },
}));

if ("onExternalChange" in api) {
  api.onExternalChange((event) => {
    useWorkspaceStore.getState().handleExternalChange(event);
  });
}

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
    baseHash: snapshot.contentHash,
    gitStatus: snapshot.gitStatus,
    recentWorkspaces: snapshot.recentWorkspaces,
    mcpSetup: null,
    selection: null,
    preview: null,
    activeProposalId: null,
    past: [],
    future: [],
    dirty: false,
    lastError: null,
  });
}

function addActivity(set: StoreSet, input: ActivityInput): void {
  set((state) => ({
    activity: [createActivityItem(input), ...state.activity].slice(0, 50),
  }));
}

function createActivityItem(input: ActivityInput): ActivityItem {
  return {
    id: `activity.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind: input.kind,
    message: input.message,
    ...(input.diagramId ? { diagramId: input.diagramId } : {}),
    ...(input.proposalId ? { proposalId: input.proposalId } : {}),
  };
}

function addExternalChangeActivity(
  set: StoreSet,
  previousDocument: DiagramDocument | null,
  event: Extract<ExternalDiagramChange, { kind: "created" | "changed" }>,
): void {
  if (event.kind === "created" || !previousDocument) {
    addActivity(set, {
      kind: "diagram",
      message: t("activity.diagramCreated", { title: event.document.title }),
      diagramId: event.diagramId,
    });
    return;
  }

  const previousProposalIds = new Set(previousDocument.proposals.map((proposal) => proposal.id));
  const addedProposals = event.document.proposals.filter((proposal) => !previousProposalIds.has(proposal.id));
  for (const proposal of addedProposals) {
    addActivity(set, {
      kind: "proposal",
      message: t("activity.proposalAdded", { title: proposal.title }),
      diagramId: event.diagramId,
      proposalId: proposal.id,
    });
  }

  const previousCommentIds = new Set(previousDocument.comments.map((comment) => comment.id));
  const addedCommentCount = event.document.comments.filter((comment) => !previousCommentIds.has(comment.id)).length;
  if (addedCommentCount > 0) {
    addActivity(set, {
      kind: "comment",
      message: t("activity.commentAdded", {
        count: addedCommentCount,
        plural: addedCommentCount === 1 ? "" : "s",
      }),
      diagramId: event.diagramId,
    });
  }

  if (addedProposals.length === 0 && addedCommentCount === 0) {
    addActivity(set, {
      kind: "diagram",
      message: t("activity.diagramChanged", { title: event.document.title }),
      diagramId: event.diagramId,
    });
  }
}

function upsertDiagramListItem(
  diagrams: DiagramListItem[],
  event: Extract<ExternalDiagramChange, { kind: "created" | "changed" }>,
): DiagramListItem[] {
  const item: DiagramListItem = {
    id: event.document.id,
    title: event.document.title,
    path: event.path,
    slug: event.slug,
    updatedAt: event.document.updatedAt,
  };
  const next = diagrams.filter(
    (diagram) => diagram.id !== item.id && diagram.slug !== item.slug && diagram.path !== item.path,
  );
  next.push(item);
  return next.sort((a, b) => a.title.localeCompare(b.title));
}

function isCurrentDiagram(
  document: DiagramDocument,
  event: Extract<ExternalDiagramChange, { kind: "created" | "changed" }>,
): boolean {
  return document.id === event.diagramId || document.metadata.slug === event.slug;
}

function selectionExists(document: DiagramDocument, selection: Selection | null): boolean {
  if (!selection) {
    return false;
  }
  switch (selection.kind) {
    case "node":
      return document.nodes.some((node) => node.id === selection.id);
    case "edge":
      return document.edges.some((edge) => edge.id === selection.id);
    case "note":
      return document.notes.some((note) => note.id === selection.id);
    case "task":
      return document.tasks.some((task) => task.id === selection.id);
    case "comment":
      return document.comments.some((comment) => comment.id === selection.id);
  }
}

function preservedToast(preserved: PreservedFromDisk): string {
  const count =
    preserved.proposals.length +
    preserved.comments.length +
    preserved.tasks.length +
    preserved.notes.length;
  return count > 0
    ? t("toast.externalMergedCount", { count, plural: count === 1 ? "" : "s" })
    : t("toast.externalMerged");
}

function proposalTitle(document: DiagramDocument, proposalId: string): string {
  return document.proposals.find((proposal) => proposal.id === proposalId)?.title ?? proposalId;
}

function saveToast(snapshot: WorkspaceSnapshot): string {
  const preserved = snapshot.preservedFromDisk;
  if (!preserved) {
    return t("toast.saved");
  }

  const counts = [
    { label: "proposal", count: preserved.proposals.length },
    { label: "comment", count: preserved.comments.length },
    { label: "task", count: preserved.tasks.length },
    { label: "note", count: preserved.notes.length },
  ]
    .filter((item) => item.count > 0)
    .map((item) =>
      t("toast.savedItem", {
        count: item.count,
        label: item.label,
        plural: item.count === 1 ? "" : "s",
      }),
    );

  return counts.length > 0
    ? t("toast.savedPreserved", { items: counts.join(", ") })
    : t("toast.saved");
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
  { value: "directed", label: "directed" },
  { value: "bidirectional", label: "bidirectional" },
  { value: "none", label: "none" },
];
