import {
  DiagramDocumentSchema,
  SCHEMA_VERSION,
  type DiagramComment,
  type DiagramDocument,
} from "./diagram.js";

const SUPPORTED_SCHEMA_VERSIONS = new Set(["0.1.0", SCHEMA_VERSION]);

export function migrateDiagram(raw: unknown): DiagramDocument {
  const version = readSchemaVersion(raw);
  if (!version || !SUPPORTED_SCHEMA_VERSIONS.has(version)) {
    throw new Error(`Unsupported diagram schema version: ${version ?? "missing"}`);
  }

  const parsed = DiagramDocumentSchema.parse(raw);
  return DiagramDocumentSchema.parse({
    ...parsed,
    schemaVersion: SCHEMA_VERSION,
    comments: parsed.comments.map(migrateComment),
  });
}

function migrateComment(comment: DiagramComment): DiagramComment {
  return {
    ...comment,
    authorKind: comment.authorKind ?? (comment.author === "agent" ? "agent" : "human"),
  };
}

function readSchemaVersion(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object" || !("schemaVersion" in raw)) {
    return undefined;
  }

  const version = raw.schemaVersion;
  return typeof version === "string" ? version : undefined;
}
