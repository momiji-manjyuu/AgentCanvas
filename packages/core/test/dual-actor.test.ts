import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addProposal,
  computeContentHash,
  createDiagramWatcher,
  createSampleDiagram,
  diagramFileContent,
  ensureWorkspace,
  saveDiagramBundle,
  saveDiagramChecked,
  type DiagramDocument,
  type DiagramProposal,
  type DiagramWatchEvent,
  type DiagramWatcher,
} from "../src/index.js";

const watchers: DiagramWatcher[] = [];

afterEach(async () => {
  await Promise.all(watchers.splice(0).map((watcher) => watcher.close()));
});

describe("dual actor collaboration", () => {
  it("preserves an agent proposal while saving stale human edits", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-dual-actor-"));
    const base = createSampleDiagram();
    await saveDiagramBundle(workspace, base, "system-overview");
    const baseHash = computeContentHash(diagramFileContent(base));

    const humanNode = {
      id: "node.billing_service",
      type: "service" as const,
      label: "Billing Service",
      codeRefs: [],
      tags: [],
      metadata: {},
    };
    const humanDocument: DiagramDocument = {
      ...base,
      nodes: [...base.nodes, humanNode],
      layout: {
        ...base.layout,
        nodes: {
          ...base.layout.nodes,
          [humanNode.id]: { x: 840, y: 320, width: 190, height: 76 },
        },
      },
    };

    const agentDocument = addProposal(base, agentProposal("proposal.agent.cache-note"));
    await saveDiagramBundle(workspace, agentDocument, "system-overview");

    const checked = await saveDiagramChecked(workspace, humanDocument, baseHash);
    const saved = JSON.parse(await readFile(checked.result.diagramPath, "utf8")) as DiagramDocument;

    expect(checked.preservedFromDisk?.proposals).toEqual(["proposal.agent.cache-note"]);
    expect(saved.nodes.some((node) => node.id === humanNode.id)).toBe(true);
    expect(saved.layout.nodes[humanNode.id]).toEqual({ x: 840, y: 320, width: 190, height: 76 });
    expect(saved.proposals.find((proposal) => proposal.id === "proposal.agent.cache-note")).toMatchObject({
      status: "pending",
      title: "Document cache fallback",
    });
  });

  it("emits watcher events for an external agent save", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-dual-actor-watch-"));
    await ensureWorkspace(workspace);
    const base = createSampleDiagram();
    await saveDiagramBundle(workspace, base, "system-overview");

    const events: DiagramWatchEvent[] = [];
    const watcher = createDiagramWatcher(workspace, (event) => {
      events.push(event);
    });
    watchers.push(watcher);
    await watcher.ready;

    const proposalId = "proposal.agent.retry-task";
    await saveDiagramBundle(workspace, addProposal(base, agentProposal(proposalId)), "system-overview");

    const event = await waitForEvent(
      events,
      (item) =>
        "document" in item &&
        item.diagramId === base.id &&
        item.document.proposals.some((proposal) => proposal.id === proposalId),
    );

    expect(event.kind === "created" || event.kind === "changed").toBe(true);
    if ("document" in event) {
      expect(event.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(event.document.proposals.find((proposal) => proposal.id === proposalId)?.status).toBe(
        "pending",
      );
    }
  });
});

function agentProposal(id: string): Omit<DiagramProposal, "createdAt" | "status"> {
  return {
    id,
    title: "Document cache fallback",
    summary: "Add a note for the cache fallback decision.",
    author: "agent",
    rationale: "The diagram already tracks Redis risk and should keep the decision visible.",
    risks: [],
    ops: [
      {
        op: "add_note",
        note: {
          id: `note.${id.replace(/^proposal\./, "").replaceAll(".", "_")}`,
          text: "Define fallback behavior when Redis is unavailable.",
          targetId: "node.redis_cache",
          kind: "decision",
        },
      },
    ],
  };
}

async function waitForEvent(
  events: DiagramWatchEvent[],
  predicate: (event: DiagramWatchEvent) => boolean,
): Promise<DiagramWatchEvent> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const event = events.find(predicate);
    if (event) {
      return event;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for watcher event. Saw ${events.length} events.`);
}
