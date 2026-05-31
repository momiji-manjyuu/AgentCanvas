import { describe, expect, it } from "vitest";
import {
  applyPatch,
  createSampleDiagram,
  previewPatch,
  type DiagramPatchOp,
} from "../src/index.js";

describe("patch operations", () => {
  it("adds and updates a node", () => {
    const document = createSampleDiagram();
    const add: DiagramPatchOp = {
      op: "add_node",
      node: {
        id: "node.search",
        type: "service",
        label: "Search Service",
        codeRefs: [],
        tags: [],
        metadata: {},
      },
    };
    const added = applyPatch(document, [add]);
    const updated = applyPatch(added, [
      { op: "update_node", id: "node.search", updates: { label: "Search API" } },
    ]);
    expect(updated.nodes.find((node) => node.id === "node.search")?.label).toBe("Search API");
  });

  it("deletes a node and removes related edges", () => {
    const document = createSampleDiagram();
    const next = applyPatch(document, [{ op: "delete_node", id: "node.user_service" }]);
    expect(next.nodes.some((node) => node.id === "node.user_service")).toBe(false);
    expect(
      next.edges.some(
        (edge) => edge.from === "node.user_service" || edge.to === "node.user_service",
      ),
    ).toBe(false);
  });

  it("rejects adding an edge with missing endpoints", () => {
    const document = createSampleDiagram();
    expect(() =>
      applyPatch(document, [
        {
          op: "add_edge",
          edge: {
            id: "edge.missing",
            from: "node.missing",
            to: "node.client",
            type: "sync",
            arrow: "directed",
            metadata: {},
          },
        },
      ]),
    ).toThrow(/node not found/);
  });

  it("previewPatch does not mutate the original document", () => {
    const document = createSampleDiagram();
    const originalCount = document.nodes.length;
    const preview = previewPatch(document, [
      {
        op: "add_node",
        node: {
          id: "node.preview",
          type: "component",
          label: "Preview Only",
          codeRefs: [],
          tags: [],
          metadata: {},
        },
      },
    ]);
    expect(preview.validation.ok).toBe(true);
    expect(preview.previewDocument?.nodes.length).toBe(originalCount + 1);
    expect(document.nodes.length).toBe(originalCount);
  });
});
