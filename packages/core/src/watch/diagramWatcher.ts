import { readFile } from "node:fs/promises";
import path from "node:path";
import chokidar from "chokidar";
import { computeContentHash } from "../sync/contentHash.js";
import { diagramsDir, readDiagramFile } from "../storage/workspace.js";
import type { DiagramDocument } from "../schema/diagram.js";

export type DiagramWatchEvent =
  | DiagramFileEvent
  | {
      kind: "removed";
      path: string;
      slug: string;
    }
  | {
      kind: "invalid";
      path: string;
      slug: string;
      error: string;
    };

export interface DiagramFileEvent {
  kind: "created" | "changed";
  path: string;
  slug: string;
  diagramId: string;
  document: DiagramDocument;
  contentHash: string;
}

export interface DiagramWatcher {
  ready: Promise<void>;
  close(): Promise<void>;
}

export function createDiagramWatcher(
  workspacePath: string,
  handler: (event: DiagramWatchEvent) => void | Promise<void>,
): DiagramWatcher {
  const directory = diagramsDir(workspacePath);
  const watcher = chokidar.watch(directory, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });
  const ready = new Promise<void>((resolve) => {
    watcher.once("ready", resolve);
  });

  watcher.on("add", (filePath) => {
    if (isDiagramPath(filePath)) {
      void emitFileEvent("created", filePath, handler);
    }
  });
  watcher.on("change", (filePath) => {
    if (isDiagramPath(filePath)) {
      void emitFileEvent("changed", filePath, handler);
    }
  });
  watcher.on("unlink", (filePath) => {
    if (isDiagramPath(filePath)) {
      void handler({ kind: "removed", path: path.resolve(filePath), slug: slugFromPath(filePath) });
    }
  });

  return {
    ready,
    async close() {
      await watcher.close();
    },
  };
}

async function emitFileEvent(
  kind: "created" | "changed",
  filePath: string,
  handler: (event: DiagramWatchEvent) => void | Promise<void>,
): Promise<void> {
  const resolved = path.resolve(filePath);
  const slug = slugFromPath(filePath);
  try {
    const document = await readDiagramFile(resolved);
    const raw = await readFile(resolved, "utf8");
    await handler({
      kind,
      path: resolved,
      slug,
      diagramId: document.id,
      document,
      contentHash: computeContentHash(raw),
    });
  } catch (error) {
    await handler({
      kind: "invalid",
      path: resolved,
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function slugFromPath(filePath: string): string {
  return path.basename(filePath).replace(/\.diagram\.json$/, "");
}

function isDiagramPath(filePath: string): boolean {
  return path.basename(filePath).endsWith(".diagram.json");
}
