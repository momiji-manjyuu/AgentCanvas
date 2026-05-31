import path from "node:path";
import { createSampleWorkspace } from "../storage/workspace.js";

const target = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), "examples", "sample-workspace");

await createSampleWorkspace(target);
console.log(`Sample workspace written to ${target}`);
