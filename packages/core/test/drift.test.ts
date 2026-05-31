import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSampleDiagram, detectDrift, type DiagramDocument } from "../src/index.js";

describe("drift detection", () => {
  it("detects missing codeRef files", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-drift-"));
    const document = withCodeRef(createSampleDiagram(), "node.auth_service", {
      path: "src/auth/AuthService.ts",
      symbol: "AuthService",
    });

    const result = await detectDrift(workspace, document);
    expect(result.issues.some((issue) => issue.type === "missing_file")).toBe(true);
  });

  it("detects unlinked src files", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-canvas-drift-"));
    await mkdir(path.join(workspace, "src"), { recursive: true });
    await writeFile(
      path.join(workspace, "src", "BillingService.ts"),
      "export class BillingService {}\n",
      "utf8",
    );

    const result = await detectDrift(workspace, createSampleDiagram());
    expect(result.issues.some((issue) => issue.type === "unlinked_code_candidate")).toBe(true);
  });
});

function withCodeRef(
  document: DiagramDocument,
  nodeId: string,
  codeRef: DiagramDocument["nodes"][number]["codeRefs"][number],
): DiagramDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === nodeId ? { ...node, codeRefs: [...(node.codeRefs ?? []), codeRef] } : node,
    ),
  };
}
