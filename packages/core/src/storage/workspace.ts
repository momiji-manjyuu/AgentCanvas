import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { exportMarkdown } from "../mermaid/exportMarkdown.js";
import { exportMermaid } from "../mermaid/exportMermaid.js";
import { createSampleDiagram } from "../samples/sampleDiagram.js";
import {
  DiagramDocumentSchema,
  SCHEMA_VERSION,
  type DiagramDocument,
} from "../schema/diagram.js";
import { atomicWrite } from "./atomicWrite.js";

export interface DiagramListItem {
  id: string;
  title: string;
  path: string;
  slug: string;
  updatedAt: string;
}

export interface SaveDiagramResult {
  diagramPath: string;
  mermaidPath: string;
  markdownPath: string;
}

export interface WorkspaceInfo {
  workspacePath: string;
  diagramsDir: string;
  diagramCount: number;
}

export function resolveWorkspacePath(workspacePath: string): string {
  return path.resolve(workspacePath);
}

export function ensureWithinWorkspace(workspacePath: string, targetPath: string): string {
  const workspaceRoot = resolveWorkspacePath(workspacePath);
  const resolvedTarget = path.resolve(workspaceRoot, targetPath);
  const relative = path.relative(workspaceRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${targetPath}`);
  }
  return resolvedTarget;
}

export function diagramsDir(workspacePath: string): string {
  return ensureWithinWorkspace(workspacePath, path.join("design", "diagrams"));
}

export async function ensureWorkspace(workspacePath: string): Promise<WorkspaceInfo> {
  const root = resolveWorkspacePath(workspacePath);
  const diagrams = diagramsDir(root);
  await mkdir(diagrams, { recursive: true });
  const diagramsList = await listDiagrams(root);
  return {
    workspacePath: root,
    diagramsDir: diagrams,
    diagramCount: diagramsList.length,
  };
}

export async function listDiagrams(workspacePath: string): Promise<DiagramListItem[]> {
  const directory = diagramsDir(workspacePath);
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const diagrams = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".diagram.json"))
        .map(async (entry) => {
          const filePath = path.join(directory, entry.name);
          const document = await readDiagramFile(filePath);
          return {
            id: document.id,
            title: document.title,
            path: filePath,
            slug: entry.name.replace(/\.diagram\.json$/, ""),
            updatedAt: document.updatedAt,
          };
        }),
    );
    return diagrams.sort((a, b) => a.title.localeCompare(b.title));
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
}

export async function loadDiagram(workspacePath: string, diagramId: string): Promise<DiagramDocument> {
  const diagrams = await listDiagrams(workspacePath);
  const match = diagrams.find((diagram) => diagram.id === diagramId || diagram.slug === diagramId);
  if (!match) {
    throw new Error(`Diagram not found: ${diagramId}`);
  }
  ensureWithinWorkspace(workspacePath, path.relative(resolveWorkspacePath(workspacePath), match.path));
  return readDiagramFile(match.path);
}

export async function saveDiagramBundle(
  workspacePath: string,
  document: DiagramDocument,
  slug = slugFromDocument(document),
): Promise<SaveDiagramResult> {
  const root = resolveWorkspacePath(workspacePath);
  const directory = diagramsDir(root);
  await mkdir(directory, { recursive: true });

  const validated = DiagramDocumentSchema.parse(document);
  const safeSlug = slugify(slug);
  const diagramPath = ensureWithinWorkspace(root, path.join("design", "diagrams", `${safeSlug}.diagram.json`));
  const mermaidPath = ensureWithinWorkspace(root, path.join("design", "diagrams", `${safeSlug}.mmd`));
  const markdownPath = ensureWithinWorkspace(root, path.join("design", "diagrams", `${safeSlug}.md`));

  await atomicWrite(diagramPath, `${stableJson(validated)}\n`);
  await atomicWrite(mermaidPath, exportMermaid(validated));
  await atomicWrite(markdownPath, exportMarkdown(validated));

  return { diagramPath, mermaidPath, markdownPath };
}

export async function createEmptyDiagram(workspacePath: string, title = "Untitled Diagram"): Promise<DiagramDocument> {
  const now = new Date().toISOString();
  const slug = await uniqueDiagramSlug(workspacePath, slugify(title));
  const id = await uniqueDiagramId(workspacePath, diagramIdFromSlug(slug));
  const document: DiagramDocument = {
    schemaVersion: SCHEMA_VERSION,
    id,
    title,
    createdAt: now,
    updatedAt: now,
    direction: "LR",
    nodes: [],
    edges: [],
    groups: [],
    notes: [],
    tasks: [],
    comments: [],
    layout: { nodes: {}, edges: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    proposals: [],
    metadata: { slug },
  };
  await saveDiagramBundle(workspacePath, document, slug);
  return document;
}

export async function createSampleWorkspace(workspacePath: string): Promise<DiagramDocument> {
  await ensureWorkspace(workspacePath);
  const slug = await uniqueDiagramSlug(workspacePath, "system-overview");
  const id = await uniqueDiagramId(workspacePath, diagramIdFromSlug(slug));
  const document = withDiagramIdentity(createSampleDiagram(), slug, id);
  await saveDiagramBundle(workspacePath, document, slug);
  return document;
}

export async function readDiagramFile(filePath: string): Promise<DiagramDocument> {
  const raw = await readFile(filePath, "utf8");
  return DiagramDocumentSchema.parse(JSON.parse(raw));
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "diagram"
  );
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortForJson(value), null, 2);
}

export async function uniqueDiagramSlug(workspacePath: string, baseSlug: string): Promise<string> {
  const root = resolveWorkspacePath(workspacePath);
  const safeBase = slugify(baseSlug);
  let candidate = safeBase;
  let index = 2;

  while (
    (await pathExists(ensureWithinWorkspace(root, path.join("design", "diagrams", `${candidate}.diagram.json`)))) ||
    (await pathExists(ensureWithinWorkspace(root, path.join("design", "diagrams", `${candidate}.mmd`)))) ||
    (await pathExists(ensureWithinWorkspace(root, path.join("design", "diagrams", `${candidate}.md`))))
  ) {
    candidate = `${safeBase}-${index}`;
    index += 1;
  }

  return candidate;
}

export async function uniqueDiagramId(workspacePath: string, baseId: string): Promise<string> {
  const diagrams = await listDiagrams(workspacePath);
  const existing = new Set(diagrams.map((diagram) => diagram.id));
  let candidate = baseId;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${baseId}.${index}`;
    index += 1;
  }
  return candidate;
}

export function diagramIdFromSlug(slug: string): string {
  return `diagram.${slug.replace(/-/g, "_")}`;
}

export function withDiagramIdentity(
  document: DiagramDocument,
  slug: string,
  id = diagramIdFromSlug(slug),
): DiagramDocument {
  return DiagramDocumentSchema.parse({
    ...document,
    id,
    metadata: { ...document.metadata, slug },
  });
}

function slugFromDocument(document: DiagramDocument): string {
  const metadataSlug = document.metadata.slug;
  return typeof metadataSlug === "string" ? metadataSlug : slugify(document.title);
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortForJson(item)]),
    );
  }
  return value;
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
