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
  importWorkspaceMermaid,
  loadWorkspaceDiagram,
  openWorkspace,
  previewWorkspacePatch,
  rejectWorkspaceProposal,
  saveWorkspaceDiagram,
} from "./workspace-service.js";

export function registerIpc(): void {
  ipcMain.handle("workspace:open-dialog", () => chooseAndOpenWorkspace());
  ipcMain.handle("workspace:open-path", (_event, workspacePath: string) => openWorkspace(workspacePath));
  ipcMain.handle("workspace:create-empty", () => createEmptyWorkspaceFromDialog());
  ipcMain.handle("workspace:create-sample", () => createSampleWorkspaceInDocuments());
  ipcMain.handle("diagram:load", (_event, diagramId: string) => loadWorkspaceDiagram(diagramId));
  ipcMain.handle("diagram:create", (_event, title: string) => createWorkspaceDiagram(title));
  ipcMain.handle("diagram:save", (_event, document) => saveWorkspaceDiagram(document));
  ipcMain.handle("diagram:import-mermaid", (_event, input) => importWorkspaceMermaid(input));
  ipcMain.handle("diagram:export-mermaid", (_event, document) => exportWorkspaceMermaid(document));
  ipcMain.handle("diagram:export-markdown", (_event, document) => exportWorkspaceMarkdown(document));
  ipcMain.handle("diagram:auto-layout", (_event, document) => autoLayoutWorkspaceDiagram(document));
  ipcMain.handle("proposal:create-sample", (_event, document) => createSampleProposal(document));
  ipcMain.handle("proposal:preview", (_event, document, ops) => previewWorkspacePatch(document, ops));
  ipcMain.handle("proposal:apply", (_event, document, proposalId) =>
    applyWorkspaceProposal(document, proposalId),
  );
  ipcMain.handle("proposal:reject", (_event, document, proposalId) =>
    rejectWorkspaceProposal(document, proposalId),
  );
  ipcMain.handle("drift:detect", (_event, document) => detectWorkspaceDrift(document));
}
