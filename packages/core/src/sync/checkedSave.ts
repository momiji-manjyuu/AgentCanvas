import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DiagramDocument } from "../schema/diagram.js";
import { migrateDiagram } from "../schema/migrate.js";
import {
  ensureWithinWorkspace,
  resolveWorkspacePath,
  saveDiagramBundle,
  slugify,
  type SaveDiagramResult,
} from "../storage/workspace.js";
import { computeContentHash, diagramFileContent } from "./contentHash.js";
import {
  mergeExternalChanges,
  type PreservedFromDisk,
} from "./mergeDiagram.js";

export interface CheckedSaveResult {
  result: SaveDiagramResult;
  contentHash: string;
  preservedFromDisk: PreservedFromDisk | null;
}

export async function saveDiagramChecked(
  workspacePath: string,
  document: DiagramDocument,
  baseHash: string | null,
): Promise<CheckedSaveResult> {
  const root = resolveWorkspacePath(workspacePath);
  const slug = slugFromDocument(document);
  const diagramPath = ensureWithinWorkspace(root, path.join("design", "diagrams", `${slug}.diagram.json`));
  const diskContent = await readOptionalFile(diagramPath);
  let documentToSave = migrateDiagram(document);
  let preservedFromDisk: PreservedFromDisk | null = null;

  if (diskContent !== null) {
    const diskHash = computeContentHash(diskContent);
    const shouldMerge = baseHash === null || diskHash !== baseHash;
    if (shouldMerge) {
      const diskDoc = migrateDiagram(JSON.parse(diskContent));
      const merged = mergeExternalChanges(diskDoc, documentToSave);
      documentToSave = merged.merged;
      preservedFromDisk = merged.preservedFromDisk;
    }
  }

  const result = await saveDiagramBundle(root, documentToSave, slug);
  return {
    result,
    contentHash: computeContentHash(diagramFileContent(documentToSave)),
    preservedFromDisk,
  };
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function slugFromDocument(document: DiagramDocument): string {
  const metadataSlug = document.metadata.slug;
  return slugify(typeof metadataSlug === "string" ? metadataSlug : document.title);
}
