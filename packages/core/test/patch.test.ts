import { describe, expect, it } from "vitest";
import {
  applyPatch,
  addProposal,
  applyProposal,
  applyProposalPartial,
  createSampleDiagram,
  describeOp,
  previewPatch,
  rejectProposal,
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

  it("rejects invalid note target ids", () => {
    const document = createSampleDiagram();
    const preview = previewPatch(document, [
      {
        op: "add_note",
        note: { id: "note.bad", text: "Bad target", kind: "warning", targetId: "node.missing" },
      },
    ]);

    expect(preview.validation.ok).toBe(false);
    expect(preview.validation.errors.join("\n")).toContain("target not found");
  });

  it("applyProposal marks the proposal accepted and keeps proposal history", () => {
    const document = createSampleDiagram();
    const withProposal = addProposal(document, {
      id: "proposal.add-node",
      title: "Add node",
      summary: "Adds a node.",
      author: "agent",
      ops: [
        {
          op: "add_node",
          node: {
            id: "node.history",
            type: "service",
            label: "History",
            codeRefs: [],
            tags: [],
            metadata: {},
          },
        },
      ],
    });

    const applied = applyProposal(withProposal, "proposal.add-node");
    expect(applied.proposals.find((proposal) => proposal.id === "proposal.add-node")?.status).toBe(
      "accepted",
    );
    expect(applied.nodes.some((node) => node.id === "node.history")).toBe(true);
    expect(applied.proposals.find((proposal) => proposal.id === "proposal.add-node")?.reviewedAt).toBeTruthy();
  });

  it("rejectProposal records review notes", () => {
    const document = addProposal(createSampleDiagram(), {
      id: "proposal.reject",
      title: "Reject me",
      summary: "Will be rejected.",
      author: "agent",
      ops: [],
    });

    const rejected = rejectProposal(document, "proposal.reject", "Needs evidence.");
    const proposal = rejected.proposals.find((item) => item.id === "proposal.reject");
    expect(proposal?.status).toBe("rejected");
    expect(proposal?.reviewNote).toBe("Needs evidence.");
    expect(proposal?.reviewedAt).toBeTruthy();
  });

  it("applyProposalPartial applies selected ops and records their indexes", () => {
    const document = addProposal(createSampleDiagram(), {
      id: "proposal.partial",
      title: "Partial",
      summary: "Adds two nodes.",
      author: "agent",
      ops: [
        {
          op: "add_node",
          node: {
            id: "node.partial_a",
            type: "service",
            label: "Partial A",
            codeRefs: [],
            tags: [],
            metadata: {},
          },
        },
        {
          op: "add_node",
          node: {
            id: "node.partial_b",
            type: "service",
            label: "Partial B",
            codeRefs: [],
            tags: [],
            metadata: {},
          },
        },
      ],
    });

    const applied = applyProposalPartial(document, "proposal.partial", [1]);
    const proposal = applied.proposals.find((item) => item.id === "proposal.partial");
    expect(applied.nodes.some((node) => node.id === "node.partial_a")).toBe(false);
    expect(applied.nodes.some((node) => node.id === "node.partial_b")).toBe(true);
    expect(proposal?.status).toBe("partially_accepted");
    expect(proposal?.appliedOpIndexes).toEqual([1]);
    expect(proposal?.reviewedAt).toBeTruthy();
  });

  it("previewPatch reports dependency errors for partial op subsets", () => {
    const document = createSampleDiagram();
    const preview = previewPatch(document, [
      {
        op: "add_edge",
        edge: {
          id: "edge.partial",
          from: "node.missing",
          to: "node.client",
          type: "sync",
          arrow: "directed",
          metadata: {},
        },
      },
    ]);

    expect(preview.validation.ok).toBe(false);
    expect(preview.validation.errors.join("\n")).toContain("node not found");
  });

  it("describeOp returns human readable operation labels", () => {
    const document = createSampleDiagram();
    expect(
      describeOp(
        {
          op: "add_node",
          node: {
            id: "node.described",
            type: "service",
            label: "Described Service",
            codeRefs: [],
            tags: [],
            metadata: {},
          },
        },
        document,
      ),
    ).toBe("Add node: Described Service");
  });
});
