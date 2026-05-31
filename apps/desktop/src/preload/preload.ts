import { contextBridge, ipcRenderer } from "electron";

const api = {
  openWorkspace: () => ipcRenderer.invoke("workspace:open-dialog"),
  openWorkspacePath: (workspacePath: string) => ipcRenderer.invoke("workspace:open-path", workspacePath),
  createEmptyWorkspace: () => ipcRenderer.invoke("workspace:create-empty"),
  createSampleWorkspace: () => ipcRenderer.invoke("workspace:create-sample"),
  loadDiagram: (diagramId: string) => ipcRenderer.invoke("diagram:load", diagramId),
  createDiagram: (title: string) => ipcRenderer.invoke("diagram:create", title),
  saveDiagram: (document: unknown) => ipcRenderer.invoke("diagram:save", document),
  importMermaid: (input: { title: string; source: string; slug?: string }) =>
    ipcRenderer.invoke("diagram:import-mermaid", input),
  exportMermaid: (document: unknown) => ipcRenderer.invoke("diagram:export-mermaid", document),
  exportMarkdown: (document: unknown) => ipcRenderer.invoke("diagram:export-markdown", document),
  autoLayout: (document: unknown) => ipcRenderer.invoke("diagram:auto-layout", document),
  createSampleProposal: (document: unknown) => ipcRenderer.invoke("proposal:create-sample", document),
  previewProposal: (document: unknown, ops: unknown[]) =>
    ipcRenderer.invoke("proposal:preview", document, ops),
  applyProposal: (document: unknown, proposalId: string) =>
    ipcRenderer.invoke("proposal:apply", document, proposalId),
  rejectProposal: (document: unknown, proposalId: string) =>
    ipcRenderer.invoke("proposal:reject", document, proposalId),
  detectDrift: (document: unknown) => ipcRenderer.invoke("drift:detect", document),
};

contextBridge.exposeInMainWorld("agentCanvas", api);

export type AgentCanvasBridge = typeof api;
