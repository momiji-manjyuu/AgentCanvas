import { describe, expect, it } from "vitest";
import { exportMermaid, importMermaid, type DiagramDocument } from "../src/index.js";

const SOURCE = `flowchart LR
  subgraph backend["Backend"]
    api_gateway["API Gateway"]
    auth_service("Auth Service")
  end
  client["Client"]
  database[("Database")]
  client -->|request| api_gateway
  api_gateway -- validate token --> auth_service
  auth_service --> database
`;

const ARROW_SOURCE = `flowchart LR
  a["A"] --- b["B"]
  b <--> c["C"]
  c -.-> d["D"]
`;

describe("Mermaid import/export", () => {
  it("imports flowchart LR with declarations, labels, and subgraph", () => {
    const document = importMermaid(SOURCE, { title: "Imported" });
    expect(document.direction).toBe("LR");
    expect(document.nodes.map((node) => node.id)).toContain("api_gateway");
    expect(document.nodes.find((node) => node.id === "database")?.type).toBe("database");
    expect(document.edges.find((edge) => edge.from === "client")?.label).toBe("request");
    expect(document.groups[0]?.label).toBe("Backend");
    expect(document.metadata.unsupportedMermaidLines).toEqual([]);
  });

  it("exports a valid basic Mermaid string", () => {
    const document = importMermaid(SOURCE, { title: "Imported" });
    const mermaid = exportMermaid(document);
    expect(mermaid).toContain("flowchart LR");
    expect(mermaid).toContain("client");
    expect(mermaid).toContain("-->|request|");
  });

  it("roundtrips import -> export -> import without losing node or edge counts", () => {
    const first = importMermaid(SOURCE, { title: "First" });
    const second = importMermaid(exportMermaid(first), { title: "Second" });
    expect(second.nodes.length).toBe(first.nodes.length);
    expect(second.edges.length).toBe(first.edges.length);
  });

  it("preserves unsafe IR ids and dependent metadata through AgentCanvas export comments", () => {
    const now = new Date().toISOString();
    const document: DiagramDocument = {
      schemaVersion: "0.1.0",
      id: "diagram.roundtrip",
      title: "Roundtrip",
      createdAt: now,
      updatedAt: now,
      direction: "LR",
      nodes: [
        { id: "node.api_gateway", type: "service", label: "API", codeRefs: [], tags: [], metadata: {} },
        { id: "node.a-b", type: "service", label: "A-B", codeRefs: [], tags: [], metadata: {} },
        { id: "node.a_b", type: "database", label: "A_B", codeRefs: [], tags: [], metadata: {} },
      ],
      edges: [
        {
          id: "edge.node.api.node.db",
          from: "node.api_gateway",
          to: "node.a_b",
          type: "sync",
          arrow: "directed",
          metadata: {},
        },
      ],
      groups: [{ id: "group.backend.v1", label: "Backend", nodeIds: ["node.api_gateway", "node.a_b"], metadata: {} }],
      notes: [{ id: "note.api", text: "Check gateway", kind: "note", targetId: "node.api_gateway" }],
      tasks: [{ id: "task.api", title: "Review", status: "todo", targetId: "node.api_gateway" }],
      comments: [
        {
          id: "comment.api",
          text: "Looks good",
          author: "agent",
          resolved: false,
          createdAt: now,
          targetId: "node.api_gateway",
        },
      ],
      layout: {
        nodes: {
          "node.api_gateway": { x: 10, y: 20, width: 190, height: 76 },
          "node.a-b": { x: 260, y: 20, width: 190, height: 76 },
          "node.a_b": { x: 510, y: 20, width: 190, height: 76 },
        },
        edges: {},
        viewport: { x: 1, y: 2, zoom: 1.2 },
      },
      proposals: [],
      metadata: { slug: "roundtrip" },
    };

    const mermaid = exportMermaid(document);
    expect(mermaid).toContain("agentcanvas:id");
    const imported = importMermaid(mermaid);
    expect(imported.nodes.map((node) => node.id).sort()).toEqual(document.nodes.map((node) => node.id).sort());
    expect(imported.edges[0]?.id).toBe("edge.node.api.node.db");
    expect(imported.edges[0]?.from).toBe("node.api_gateway");
    expect(imported.groups[0]?.nodeIds).toEqual(["node.api_gateway", "node.a_b"]);
    expect(imported.notes[0]?.targetId).toBe("node.api_gateway");
    expect(imported.tasks[0]?.targetId).toBe("node.api_gateway");
    expect(imported.comments[0]?.targetId).toBe("node.api_gateway");
    expect(Object.keys(imported.layout.nodes).sort()).toEqual(Object.keys(document.layout.nodes).sort());
  });

  it("keeps ordinary Mermaid ids when AgentCanvas comments are absent", () => {
    const document = importMermaid("flowchart LR\n  node.api --> node.db\n", { title: "External" });
    expect(document.nodes.map((node) => node.id).sort()).toEqual(["node.api", "node.db"]);
  });

  it("imports and exports edge arrow modes", () => {
    const document = importMermaid(ARROW_SOURCE, { title: "Arrows" });
    expect(document.edges.find((edge) => edge.from === "a")?.arrow).toBe("none");
    expect(document.edges.find((edge) => edge.from === "b")?.arrow).toBe("bidirectional");
    expect(document.edges.find((edge) => edge.from === "c")?.arrow).toBe("directed");

    const mermaid = exportMermaid(document);
    expect(mermaid).toContain("a --- b");
    expect(mermaid).toContain("b <--> c");
    expect(mermaid).toContain("c -.-> d");
  });

  it("handles semicolons, inline comments, and multiple statements per line", () => {
    const document = importMermaid(
      'flowchart LR; a["A"] -->|calls| b["B"]; b["B"] --> c["C"] %% inline comment',
      { title: "Statements" },
    );
    expect(document.nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c"]);
    expect(document.edges).toHaveLength(2);
    expect(document.metadata.mermaidComments).toEqual(["inline comment"]);
  });

  it("escapes quoted labels that contain quotes, pipes, and brackets", () => {
    const document = importMermaid('flowchart LR\n  a["A \\"quote\\" | bracket \\]"] -->|uses \\| pipe| b["B"]\n');
    const exported = exportMermaid(document);
    const imported = importMermaid(exported);
    expect(imported.nodes.find((node) => node.id === "a")?.label).toBe('A "quote" | bracket ]');
    expect(imported.edges[0]?.label).toBe("uses | pipe");
  });

  it("records unsupported syntax as metadata and warning notes", () => {
    const document = importMermaid("flowchart LR\n  classDef hot fill:#f00\n", { title: "Unsupported" });
    expect(document.metadata.unsupportedMermaidLines).toEqual(["classDef hot fill:#f00"]);
    expect(document.notes.some((note) => note.kind === "warning")).toBe(true);
  });
});
