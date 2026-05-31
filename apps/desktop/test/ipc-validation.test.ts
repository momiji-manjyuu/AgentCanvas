import { describe, expect, it } from "vitest";
import { parseDiagramPatchOps, parseIpcInput, NonEmptyStringSchema } from "../src/main/ipc-validation.js";

describe("IPC validation", () => {
  it("rejects empty strings", () => {
    expect(() => parseIpcInput(NonEmptyStringSchema, "", "value")).toThrow(/Invalid value/);
  });

  it("rejects invalid patch op shapes", () => {
    expect(() => parseDiagramPatchOps([{ op: "add_node", node: { id: "node.bad" } }])).toThrow(
      /Invalid ops/,
    );
  });
});
