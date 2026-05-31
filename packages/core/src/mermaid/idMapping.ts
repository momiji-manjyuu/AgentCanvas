const SAFE_MERMAID_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface MermaidIdMappingEntry {
  alias: string;
  original: string;
}

export interface MermaidIdMap {
  entries: MermaidIdMappingEntry[];
  toAlias(id: string): string;
  toOriginal(alias: string): string;
}

export function isMermaidSafeId(id: string): boolean {
  return SAFE_MERMAID_ID.test(id);
}

export function createMermaidIdMap(ids: Iterable<string>): MermaidIdMap {
  const uniqueIds = [...new Set([...ids].filter(Boolean))];
  const safeOriginalIds = new Set(uniqueIds.filter(isMermaidSafeId));
  const aliasById = new Map<string, string>();
  const originalByAlias = new Map<string, string>();
  const usedAliases = new Set<string>();

  for (const id of uniqueIds) {
    const baseAlias = isMermaidSafeId(id) ? id : sanitizeMermaidId(id);
    let alias = baseAlias;
    let suffix = 2;

    while (
      usedAliases.has(alias) ||
      (!isMermaidSafeId(id) && safeOriginalIds.has(alias) && alias !== id)
    ) {
      alias = `${baseAlias}_${suffix}`;
      suffix += 1;
    }

    usedAliases.add(alias);
    aliasById.set(id, alias);
    originalByAlias.set(alias, id);
  }

  return {
    entries: [...aliasById.entries()].map(([original, alias]) => ({ alias, original })),
    toAlias(id) {
      return aliasById.get(id) ?? sanitizeMermaidId(id);
    },
    toOriginal(alias) {
      return originalByAlias.get(alias) ?? alias;
    },
  };
}

export function formatIdMappingComment(entry: MermaidIdMappingEntry): string {
  return `%% agentcanvas:id ${entry.alias} ${encodeCommentValue(entry.original)}`;
}

export function parseIdMappingComment(comment: string): MermaidIdMappingEntry | null {
  const match = comment.trim().match(/^agentcanvas:id\s+(\S+)\s+(.+)$/);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    alias: match[1],
    original: decodeCommentValue(match[2].trim()),
  };
}

export function formatAgentCanvasDataComment(value: unknown): string {
  return `%% agentcanvas:data ${encodeCommentValue(JSON.stringify(value))}`;
}

export function parseAgentCanvasDataComment(comment: string): unknown {
  const match = comment.trim().match(/^agentcanvas:data\s+(.+)$/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(decodeCommentValue(match[1].trim()));
  } catch {
    return null;
  }
}

export function encodeCommentValue(value: string): string {
  return encodeURIComponent(value);
}

export function decodeCommentValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sanitizeMermaidId(id: string): string {
  const sanitized = id.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_");
  const trimmed = sanitized.replace(/^_+|_+$/g, "");
  const withFallback = trimmed || "id";
  return withFallback.replace(/^([0-9])/, "_$1");
}
