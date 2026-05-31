import { describe, expect, it } from "vitest";
import { DiagramDocumentSchema, createSampleDiagram } from "../src/index.js";

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
});
