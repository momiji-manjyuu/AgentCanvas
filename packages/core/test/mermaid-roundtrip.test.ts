import { describe, expect, it } from "vitest";
import { exportMermaid, importMermaid } from "../src/index.js";

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
});
