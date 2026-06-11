import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

const api = {
  openWorkspace: () => ipcRenderer.invoke("workspace:open-dialog"),
  openWorkspacePath: (workspacePath: string) => ipcRenderer.invoke("workspace:open-path", workspacePath),
  getRecentWorkspaces: () => ipcRenderer.invoke("workspace:recent"),
  getMcpSetupInfo: () => ipcRenderer.invoke("workspace:mcp-setup"),
  createEmptyWorkspace: () => ipcRenderer.invoke("workspace:create-empty"),
  createSampleWorkspace: () => ipcRenderer.invoke("workspace:create-sample"),
  loadDiagram: (diagramId: string) => ipcRenderer.invoke("diagram:load", diagramId),
  createDiagram: (title: string) => ipcRenderer.invoke("diagram:create", title),
  saveDiagram: (document: unknown, baseHash: string | null) =>
    ipcRenderer.invoke("diagram:save", { document, baseHash }),
  importMermaid: (input: { title: string; source: string; slug?: string }) =>
    ipcRenderer.invoke("diagram:import-mermaid", input),
  exportMermaid: (document: unknown) => ipcRenderer.invoke("diagram:export-mermaid", document),
  exportMarkdown: (document: unknown) => ipcRenderer.invoke("diagram:export-markdown", document),
  exportFile: (input: unknown) => ipcRenderer.invoke("export:file", input),
  autoLayout: (document: unknown) => ipcRenderer.invoke("diagram:auto-layout", document),
  createSampleProposal: (document: unknown) => ipcRenderer.invoke("proposal:create-sample", document),
  previewProposal: (document: unknown, ops: unknown[]) =>
    ipcRenderer.invoke("proposal:preview", document, ops),
  applyProposal: (document: unknown, proposalId: string, opIndexes?: number[]) =>
    ipcRenderer.invoke("proposal:apply", document, proposalId, opIndexes),
  rejectProposal: (document: unknown, proposalId: string, reviewNote?: string) =>
    ipcRenderer.invoke("proposal:reject", document, proposalId, reviewNote),
  detectDrift: (document: unknown) => ipcRenderer.invoke("drift:detect", document),
  onExternalChange: (callback: (payload: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => {
      callback(payload);
    };
    ipcRenderer.on("agentcanvas:externalChange", listener);
    return () => ipcRenderer.removeListener("agentcanvas:externalChange", listener);
  },
};

contextBridge.exposeInMainWorld("agentCanvas", api);

export type AgentCanvasBridge = typeof api;
