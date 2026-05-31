import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEmptyDiagram,
  ensureWithinWorkspace,
  importMermaid,
  listDiagrams,
  saveDiagramBundle,
  stableJson,
  uniqueDiagramId,
  uniqueDiagramSlug,
  diagramIdFromSlug,
} from "../src/index.js";

describe("workspace storage", () => {
  it("creates unique slugs and diagram ids for duplicate titles", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-workspace-"));
    const first = await createEmptyDiagram(workspace, "System Overview");
    const second = await createEmptyDiagram(workspace, "System Overview");
    const diagrams = await listDiagrams(workspace);

    expect(first.id).not.toBe(second.id);
    expect(diagrams.map((diagram) => diagram.slug).sort()).toEqual(["system-overview", "system-overview-2"]);
  });

  it("lets Mermaid imports choose non-overwriting slugs", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-workspace-"));
    const firstSlug = await uniqueDiagramSlug(workspace, "Imported Diagram");
    const firstId = await uniqueDiagramId(workspace, diagramIdFromSlug(firstSlug));
    const first = importMermaid("flowchart LR\n  a --> b\n", {
      title: "Imported Diagram",
      slug: firstSlug,
      id: firstId,
    });
    await saveDiagramBundle(workspace, first, firstSlug);

    const secondSlug = await uniqueDiagramSlug(workspace, "Imported Diagram");
    expect(secondSlug).toBe("imported-diagram-2");
  });

  it("keeps stable JSON key ordering", async () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}');
  });

  it("rejects path traversal", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-workspace-"));
    expect(() => ensureWithinWorkspace(workspace, "../secret.ts")).toThrow(/escapes workspace/);
  });

  it("writes deterministic diagram JSON", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-workspace-"));
    const document = await createEmptyDiagram(workspace, "Deterministic");
    const filePath = path.join(workspace, "design", "diagrams", "deterministic.diagram.json");
    const first = await readFile(filePath, "utf8");
    await writeFile(filePath, first, "utf8");
    await saveDiagramBundle(workspace, document, "deterministic");
    expect(await readFile(filePath, "utf8")).toBe(first);
  });
});
