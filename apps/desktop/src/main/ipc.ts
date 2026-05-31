import { ipcMain } from "electron";
import {
  applyWorkspaceProposal,
  autoLayoutWorkspaceDiagram,
  chooseAndOpenWorkspace,
  createEmptyWorkspaceFromDialog,
  createSampleProposal,
  createSampleWorkspaceInDocuments,
  createWorkspaceDiagram,
  detectWorkspaceDrift,
  exportWorkspaceMarkdown,
  exportWorkspaceMermaid,
  getRecentWorkspaces,
  importWorkspaceMermaid,
  loadWorkspaceDiagram,
  openWorkspace,
  previewWorkspacePatch,
  rejectWorkspaceProposal,
  saveWorkspaceDiagram,
} from "./workspace-service.js";
import {
  ImportMermaidInputSchema,
  NonEmptyStringSchema,
  parseDiagramPatchOps,
  parseDiagramDocument,
  parseIpcInput,
  safeErrorMessage,
} from "./ipc-validation.js";

export function registerIpc(): void {
  ipcMain.handle("workspace:open-dialog", () => chooseAndOpenWorkspace());
  ipcMain.handle("workspace:open-path", (_event, workspacePath: unknown) =>
    safeInvoke(() => openWorkspace(parseIpcInput(NonEmptyStringSchema, workspacePath, "workspacePath"))),
  );
  ipcMain.handle("workspace:create-empty", () => createEmptyWorkspaceFromDialog());
  ipcMain.handle("workspace:create-sample", () => createSampleWorkspaceInDocuments());
  ipcMain.handle("workspace:recent", () => safeInvoke(() => getRecentWorkspaces()));
  ipcMain.handle("diagram:load", (_event, diagramId: unknown) =>
    safeInvoke(() => loadWorkspaceDiagram(parseIpcInput(NonEmptyStringSchema, diagramId, "diagramId"))),
  );
  ipcMain.handle("diagram:create", (_event, title: unknown) =>
    safeInvoke(() => createWorkspaceDiagram(parseIpcInput(NonEmptyStringSchema, title, "title"))),
  );
  ipcMain.handle("diagram:save", (_event, document: unknown) =>
    safeInvoke(() => saveWorkspaceDiagram(parseDiagramDocument(document))),
  );
  ipcMain.handle("diagram:import-mermaid", (_event, input: unknown) =>
    safeInvoke(() => {
      const parsed = parseIpcInput(ImportMermaidInputSchema, input, "importMermaid");
      return importWorkspaceMermaid({
        title: parsed.title,
        source: parsed.source,
        ...(parsed.slug ? { slug: parsed.slug } : {}),
      });
    }),
  );
  ipcMain.handle("diagram:export-mermaid", (_event, document: unknown) =>
    safeInvoke(() => exportWorkspaceMermaid(parseDiagramDocument(document))),
  );
  ipcMain.handle("diagram:export-markdown", (_event, document: unknown) =>
    safeInvoke(() => exportWorkspaceMarkdown(parseDiagramDocument(document))),
  );
  ipcMain.handle("diagram:auto-layout", (_event, document: unknown) =>
    safeInvoke(() => autoLayoutWorkspaceDiagram(parseDiagramDocument(document))),
  );
  ipcMain.handle("proposal:create-sample", (_event, document: unknown) =>
    safeInvoke(() => createSampleProposal(parseDiagramDocument(document))),
  );
  ipcMain.handle("proposal:preview", (_event, document: unknown, ops: unknown) =>
    safeInvoke(() =>
      previewWorkspacePatch(
        parseDiagramDocument(document),
        parseDiagramPatchOps(ops),
      ),
    ),
  );
  ipcMain.handle("proposal:apply", (_event, document: unknown, proposalId: unknown) =>
    safeInvoke(() =>
      applyWorkspaceProposal(
        parseDiagramDocument(document),
        parseIpcInput(NonEmptyStringSchema, proposalId, "proposalId"),
      ),
    ),
  );
  ipcMain.handle("proposal:reject", (_event, document: unknown, proposalId: unknown) =>
    safeInvoke(() =>
      rejectWorkspaceProposal(
        parseDiagramDocument(document),
        parseIpcInput(NonEmptyStringSchema, proposalId, "proposalId"),
      ),
    ),
  );
  ipcMain.handle("drift:detect", (_event, document: unknown) =>
    safeInvoke(() => detectWorkspaceDrift(parseDiagramDocument(document))),
  );
}

async function safeInvoke<T>(action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
