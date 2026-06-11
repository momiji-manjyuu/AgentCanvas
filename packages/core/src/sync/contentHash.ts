import { createHash } from "node:crypto";
import { migrateDiagram } from "../schema/migrate.js";
import type { DiagramDocument } from "../schema/diagram.js";
import { stableJson } from "../storage/stableJson.js";

export function diagramFileContent(document: DiagramDocument): string {
  return `${stableJson(migrateDiagram(document))}\n`;
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
