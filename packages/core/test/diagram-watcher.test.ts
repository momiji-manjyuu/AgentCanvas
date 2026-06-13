import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDiagramWatcher,
  createSampleDiagram,
  diagramsDir,
  ensureWorkspace,
  saveDiagramBundle,
  type DiagramWatchEvent,
  type DiagramWatcher,
} from "../src/index.js";

const watchers: DiagramWatcher[] = [];

afterEach(async () => {
  await Promise.all(watchers.splice(0).map((watcher) => watcher.close()));
});

describe("diagram watcher", () => {
  it("emits an event when a diagram file is saved", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-watch-"));
    await ensureWorkspace(workspace);
    const events: DiagramWatchEvent[] = [];
    const watcher = createDiagramWatcher(workspace, (event) => {
      events.push(event);
    });
    watchers.push(watcher);
    await watcher.ready;

    const document = createSampleDiagram();
    await saveDiagramBundle(workspace, document, "watched");

    const event = await waitForEvent(events, (item) => "diagramId" in item && item.diagramId === document.id);
    expect(event.kind === "created" || event.kind === "changed").toBe(true);
    if ("contentHash" in event) {
      expect(event.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("emits invalid instead of throwing for broken JSON", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-watch-"));
    await ensureWorkspace(workspace);
    const events: DiagramWatchEvent[] = [];
    const watcher = createDiagramWatcher(workspace, (event) => {
      events.push(event);
    });
    watchers.push(watcher);
    await watcher.ready;

    await writeFile(path.join(diagramsDir(workspace), "broken.diagram.json"), "{", "utf8");

    const event = await waitForEvent(events, (item) => item.kind === "invalid");
    expect(event.kind).toBe("invalid");
    if (event.kind === "invalid") {
      expect(event.slug).toBe("broken");
      expect(event.error).toBeTruthy();
    }
  });
});

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
