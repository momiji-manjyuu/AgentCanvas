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
  exportFile,
  exportWorkspaceMarkdown,
  exportWorkspaceMermaid,
  getMcpSetupInfo,
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
  ExportFileInputSchema,
  NonEmptyStringSchema,
  OperationIndexesSchema,
  OptionalStringSchema,
  parseDiagramPatchOps,
  parseDiagramDocument,
  parseIpcInput,
  parseSaveDiagramInput,
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
  ipcMain.handle("workspace:mcp-setup", () => safeInvoke(() => getMcpSetupInfo()));
  ipcMain.handle("diagram:load", (_event, diagramId: unknown) =>
    safeInvoke(() => loadWorkspaceDiagram(parseIpcInput(NonEmptyStringSchema, diagramId, "diagramId"))),
  );
  ipcMain.handle("diagram:create", (_event, title: unknown) =>
    safeInvoke(() => createWorkspaceDiagram(parseIpcInput(NonEmptyStringSchema, title, "title"))),
  );
  ipcMain.handle("diagram:save", (_event, input: unknown) =>
    safeInvoke(() => {
      const parsed = parseSaveDiagramInput(input);
      return saveWorkspaceDiagram(parsed.document, parsed.baseHash);
    }),
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
  ipcMain.handle("export:file", (_event, input: unknown) =>
    safeInvoke(() => exportFile(parseIpcInput(ExportFileInputSchema, input, "exportFile"))),
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
  ipcMain.handle("proposal:apply", (_event, document: unknown, proposalId: unknown, opIndexes: unknown) =>
    safeInvoke(() =>
      applyWorkspaceProposal(
        parseDiagramDocument(document),
        parseIpcInput(NonEmptyStringSchema, proposalId, "proposalId"),
        parseIpcInput(OperationIndexesSchema, opIndexes, "opIndexes"),
      ),
    ),
  );
  ipcMain.handle("proposal:reject", (_event, document: unknown, proposalId: unknown, reviewNote: unknown) =>
    safeInvoke(() =>
      rejectWorkspaceProposal(
        parseDiagramDocument(document),
        parseIpcInput(NonEmptyStringSchema, proposalId, "proposalId"),
        parseIpcInput(OptionalStringSchema, reviewNote, "reviewNote"),
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
