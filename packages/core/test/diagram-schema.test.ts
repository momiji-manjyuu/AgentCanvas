import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DiagramDocumentSchema,
  SCHEMA_VERSION,
  createSampleDiagram,
  migrateDiagram,
  readDiagramFile,
  saveDiagramBundle,
} from "../src/index.js";

const LEGACY_FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/legacy-v0.1.diagram.json", import.meta.url),
);

describe("DiagramDocument schema", () => {
  it("validates the sample diagram", () => {
    const result = DiagramDocumentSchema.safeParse(createSampleDiagram());
    expect(result.success).toBe(true);
  });

  it("defaults legacy edges to one-way arrows", () => {
    const sample = createSampleDiagram();
    const legacy = {
      ...sample,
      edges: sample.edges.map(({ arrow: _arrow, ...edge }) => edge),
    };
    const parsed = DiagramDocumentSchema.parse(legacy);
    expect(parsed.edges[0]?.arrow).toBe("directed");
  });

  it("migrates v0.1 diagrams to the latest schema", async () => {
    const legacy = JSON.parse(await readFile(LEGACY_FIXTURE_PATH, "utf8"));
    const migrated = migrateDiagram(legacy);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.comments[0]?.authorKind).toBe("agent");
  });

  it("reads and saves legacy diagrams as v0.2 documents", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-migrate-"));
    const migrated = await readDiagramFile(LEGACY_FIXTURE_PATH);

    const result = await saveDiagramBundle(workspace, migrated, "legacy-diagram");
    const saved = JSON.parse(await readFile(result.diagramPath, "utf8"));

    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved.comments[0]?.authorKind).toBe("agent");
  });

  it("rejects unknown schema versions clearly", () => {
    const sample = createSampleDiagram();
    expect(() => migrateDiagram({ ...sample, schemaVersion: "9.9.9" })).toThrow(
      /Unsupported diagram schema version: 9\.9\.9/,
    );
  });
});
