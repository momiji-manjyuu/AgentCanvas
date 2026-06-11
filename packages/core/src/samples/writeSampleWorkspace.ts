import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createSampleDiagram } from "./sampleDiagram.js";
import { diagramsDir, saveDiagramBundle, withDiagramIdentity } from "../storage/workspace.js";

const target = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), "examples", "sample-workspace");

await mkdir(diagramsDir(target), { recursive: true });
await saveDiagramBundle(target, withDiagramIdentity(createSampleDiagram(), "system-overview"), "system-overview");
console.log(`Sample workspace written to ${target}`);
