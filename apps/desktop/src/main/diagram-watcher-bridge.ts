import path from "node:path";
import type { WebContents } from "electron";
import {
  createDiagramWatcher,
  type DiagramWatchEvent,
  type DiagramWatcher,
} from "@agent-canvas/core";

let target: WebContents | null = null;
let watcher: DiagramWatcher | null = null;
const selfWriteHashes = new Map<string, string>();

export function setExternalChangeTarget(webContents: WebContents): void {
  target = webContents;
  webContents.once("destroyed", () => {
    if (target === webContents) {
      target = null;
    }
  });
}

export async function startDiagramWatcher(workspacePath: string): Promise<void> {
  await stopDiagramWatcher();
  watcher = createDiagramWatcher(workspacePath, handleWatcherEvent);
  await watcher.ready;
}

export async function stopDiagramWatcher(): Promise<void> {
  if (!watcher) {
    return;
  }
  const current = watcher;
  watcher = null;
  await current.close();
}

export function rememberSelfWrite(diagramPath: string, contentHash: string): void {
  selfWriteHashes.set(path.resolve(diagramPath), contentHash);
}

function handleWatcherEvent(event: DiagramWatchEvent): void {
  if (isSelfEcho(event)) {
    return;
  }
  target?.send("agentcanvas:externalChange", event);
}

function isSelfEcho(event: DiagramWatchEvent): boolean {
  if (!("contentHash" in event)) {
    return false;
  }
  return selfWriteHashes.get(path.resolve(event.path)) === event.contentHash;
}
