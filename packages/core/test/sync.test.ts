import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addProposal,
  computeContentHash,
  createSampleDiagram,
  diagramFileContent,
  saveDiagramBundle,
  saveDiagramChecked,
  type DiagramDocument,
  type DiagramProposal,
} from "../src/index.js";

describe("checked diagram save", () => {
  it("preserves disk-only collaboration records when saving stale memory", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-checked-save-"));
    const base = withSlug(createSampleDiagram(), "system-overview");
    await saveDiagramBundle(workspace, base, "system-overview");
    const baseHash = computeContentHash(diagramFileContent(base));

    const diskDoc: DiagramDocument = {
      ...base,
      proposals: [
        ...base.proposals,
        proposal("proposal.disk", "Disk proposal", "pending"),
      ],
      comments: [
        {
          id: "comment.disk",
          text: "Disk comment",
          author: "agent",
          authorKind: "agent",
          resolved: false,
          createdAt: new Date().toISOString(),
        },
      ],
      tasks: [
        ...base.tasks,
        { id: "task.disk", title: "Disk task", status: "todo" },
      ],
      notes: [
        ...base.notes,
        { id: "note.disk", text: "Disk note", kind: "note" },
      ],
    };
    await saveDiagramBundle(workspace, diskDoc, "system-overview");

    const memoryDoc: DiagramDocument = {
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: "node.memory",
          type: "service",
          label: "Memory Service",
          codeRefs: [],
          tags: [],
          metadata: {},
        },
      ],
    };

    const checked = await saveDiagramChecked(workspace, memoryDoc, baseHash);
    const saved = JSON.parse(await readFile(checked.result.diagramPath, "utf8")) as DiagramDocument;

    expect(checked.preservedFromDisk).toEqual({
      proposals: ["proposal.disk"],
      comments: ["comment.disk"],
      tasks: ["task.disk"],
      notes: ["note.disk"],
    });
    expect(saved.nodes.some((node) => node.id === "node.memory")).toBe(true);
    expect(saved.proposals.some((item) => item.id === "proposal.disk")).toBe(true);
    expect(saved.comments.some((item) => item.id === "comment.disk")).toBe(true);
    expect(saved.tasks.some((item) => item.id === "task.disk")).toBe(true);
    expect(saved.notes.some((item) => item.id === "note.disk")).toBe(true);
  });

  it("prefers decided disk proposals over pending memory proposals with the same id", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-checked-save-"));
    const base = withSlug(createSampleDiagram(), "system-overview");
    await saveDiagramBundle(workspace, base, "system-overview");
    const baseHash = computeContentHash(diagramFileContent(base));

    const disk = addProposal(base, {
      ...proposal("proposal.same", "Same proposal", "accepted"),
      reviewNote: "Reviewed on disk",
      reviewedAt: new Date().toISOString(),
    });
    await saveDiagramBundle(workspace, disk, "system-overview");

    const memory = addProposal(base, proposal("proposal.same", "Same proposal", "pending"));
    const checked = await saveDiagramChecked(workspace, memory, baseHash);
    const saved = JSON.parse(await readFile(checked.result.diagramPath, "utf8")) as DiagramDocument;

    expect(saved.proposals.find((item) => item.id === "proposal.same")?.status).toBe("accepted");
    expect(saved.proposals.find((item) => item.id === "proposal.same")?.reviewNote).toBe(
      "Reviewed on disk",
    );
    expect(checked.preservedFromDisk?.proposals).toEqual(["proposal.same"]);
  });

  it("skips merge when base hash matches disk", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-checked-save-"));
    const base = withSlug(createSampleDiagram(), "system-overview");
    await saveDiagramBundle(workspace, base, "system-overview");
    const baseHash = computeContentHash(diagramFileContent(base));

    const memory = {
      ...base,
      title: "Local title",
    };

    const checked = await saveDiagramChecked(workspace, memory, baseHash);
    expect(checked.preservedFromDisk).toBeNull();
  });
});

function withSlug(document: DiagramDocument, slug: string): DiagramDocument {
  return {
    ...document,
    metadata: { ...document.metadata, slug },
  };
}

function proposal(
  id: string,
  title: string,
  status: DiagramProposal["status"],
): DiagramProposal {
  return {
    id,
    title,
    summary: `${title}.`,
    createdAt: new Date().toISOString(),
    author: "agent",
    status,
    ops: [],
  };
}
