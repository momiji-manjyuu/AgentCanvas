import { nanoid } from "nanoid";
import { autoLayout } from "../layout/autoLayout.js";
import {
  type DiagramDocument,
  type DiagramEdgeArrow,
  type DiagramEdge,
  type DiagramEdgeType,
  type DiagramGroup,
  type DiagramLayout,
  type DiagramNode,
  type DiagramNodeType,
  type DiagramProposal,
  type DiagramComment,
  type DiagramNote,
  type DiagramTask,
  SCHEMA_VERSION,
  DiagramDocumentSchema,
} from "../schema/diagram.js";
import { parseAgentCanvasDataComment, parseIdMappingComment } from "./idMapping.js";

export interface ImportMermaidOptions {
  id?: string;
  title?: string;
  slug?: string;
}

interface ParsedNodeExpression {
  id: string;
  label?: string;
  type: DiagramNodeType;
}

interface ParsedEdgeExpression {
  from: ParsedNodeExpression;
  to: ParsedNodeExpression;
  label?: string;
  type: DiagramEdgeType;
  arrow: DiagramEdgeArrow;
}

interface MermaidStatement {
  text: string;
  raw: string;
  comment: boolean;
}

interface AgentCanvasMermaidData {
  version: 1;
  document?: {
    id?: string;
    title?: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  edgeIds?: Array<{ id: string; from: string; to: string }>;
  notes?: DiagramNote[];
  tasks?: DiagramTask[];
  comments?: DiagramComment[];
  layout?: DiagramLayout;
  proposals?: DiagramProposal[];
  metadata?: Record<string, unknown>;
}

const ID_SOURCE = String.raw`([A-Za-z0-9_.:-]+)`;
const QUOTED_LABEL_SOURCE = String.raw`"((?:\\.|[^"\\])*)"`;
const EDGE_OPERATOR_SOURCE = String.raw`<-->|<==>|<-\.->|-->|---|==>|===|-\.->|-\.-`;
const edgeOperators: Record<string, { type: DiagramEdgeType; arrow: DiagramEdgeArrow }> = {
  "-->": { type: "sync", arrow: "directed" },
  "<-->": { type: "sync", arrow: "bidirectional" },
  "---": { type: "sync", arrow: "none" },
  "-.->": { type: "async", arrow: "directed" },
  "<-.->": { type: "async", arrow: "bidirectional" },
  "-.-": { type: "async", arrow: "none" },
  "==>": { type: "dependency", arrow: "directed" },
  "<==>": { type: "dependency", arrow: "bidirectional" },
  "===": { type: "dependency", arrow: "none" },
};

export function importMermaid(source: string, options: ImportMermaidOptions = {}): DiagramDocument {
  const now = new Date().toISOString();
  const statements = tokenizeMermaid(source);
  const idMappings = new Map<string, string>();
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const groups = new Map<string, DiagramGroup>();
  const groupStack: string[] = [];
  const unsupportedMermaidLines: string[] = [];
  const mermaidComments: string[] = [];
  let direction: DiagramDocument["direction"] = "LR";
  let agentData: AgentCanvasMermaidData | null = null;

  for (const statement of statements) {
    if (!statement.comment) {
      continue;
    }

    const idMapping = parseIdMappingComment(statement.text);
    if (idMapping) {
      idMappings.set(idMapping.alias, idMapping.original);
      continue;
    }

    const parsedData = parseAgentCanvasDataComment(statement.text);
    if (isAgentData(parsedData)) {
      agentData = parsedData;
      continue;
    }

    mermaidComments.push(statement.text);
  }

  const resolveId = (alias: string) => idMappings.get(alias) ?? alias;
  const edgeIdHints = agentData?.edgeIds ?? [];
  let edgeHintIndex = 0;

  for (const statement of statements) {
    if (statement.comment) {
      continue;
    }

    const line = statement.text.trim();
    if (!line) {
      continue;
    }

    const flowchart = line.match(/^(flowchart|graph)\s+(LR|TD|TB|RL|BT)$/i);
    if (flowchart?.[2]) {
      direction = flowchart[2].toUpperCase() as DiagramDocument["direction"];
      continue;
    }

    const subgraph = parseSubgraph(line, resolveId);
    if (subgraph) {
      groups.set(subgraph.id, {
        id: subgraph.id,
        label: subgraph.label,
        nodeIds: [],
        metadata: {},
      });
      groupStack.push(subgraph.id);
      continue;
    }

    if (/^end$/i.test(line)) {
      groupStack.pop();
      continue;
    }

    const edge = parseEdge(line, resolveId);
    if (edge) {
      const from = ensureNode(nodes, edge.from, activeGroup(groupStack));
      const to = ensureNode(nodes, edge.to, activeGroup(groupStack));
      const groupId = activeGroup(groupStack);
      if (groupId) {
        addGroupNode(groups, groupId, from.id);
        addGroupNode(groups, groupId, to.id);
      }
      edges.push({
        id: edgeIdFor(edgeIdHints, edgeHintIndex, from.id, to.id, edges),
        from: from.id,
        to: to.id,
        ...(edge.label ? { label: edge.label } : {}),
        type: edge.type,
        arrow: edge.arrow,
        metadata: {},
      });
      edgeHintIndex += 1;
      continue;
    }

    const nodeExpression = parseNodeExpression(line, resolveId);
    if (nodeExpression) {
      const node = ensureNode(nodes, nodeExpression, activeGroup(groupStack));
      const groupId = activeGroup(groupStack);
      if (groupId) {
        addGroupNode(groups, groupId, node.id);
      }
      continue;
    }

    unsupportedMermaidLines.push(statement.raw.trim());
  }

  const title = options.title ?? agentData?.document?.title ?? "Imported Diagram";
  const slug = options.slug ?? metadataSlug(agentData?.metadata) ?? slugify(title);
  const layout = agentData?.layout ?? { nodes: {}, edges: {}, viewport: { x: 0, y: 0, zoom: 1 } };
  const restoredNotes = agentData?.notes ?? [];
  const warningNotes: DiagramNote[] = unsupportedMermaidLines.map((text, index) => ({
    id: `note.unsupported_mermaid.${index + 1}`,
    text: `Unsupported Mermaid line: ${text}`,
    kind: "warning",
  }));

  const document: DiagramDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? agentData?.document?.id ?? `diagram.${slugify(title)}.${nanoid(6)}`,
    title,
    ...(agentData?.document?.description ? { description: agentData.document.description } : {}),
    createdAt: agentData?.document?.createdAt ?? now,
    updatedAt: agentData?.document?.updatedAt ?? now,
    direction,
    nodes: [...nodes.values()],
    edges,
    groups: [...groups.values()],
    notes: [...restoredNotes, ...warningNotes],
    tasks: agentData?.tasks ?? [],
    comments: agentData?.comments ?? [],
    layout,
    proposals: agentData?.proposals ?? [],
    metadata: {
      ...(agentData?.metadata ?? {}),
      importedFrom: "mermaid",
      unsupportedMermaidLines,
      mermaidComments,
      slug,
    },
  };

  const parsed = DiagramDocumentSchema.parse(document);
  return agentData?.layout ? parsed : DiagramDocumentSchema.parse(autoLayout(parsed));
}

function parseSubgraph(
  line: string,
  resolveId: (alias: string) => string,
): { id: string; label: string } | undefined {
  const explicit = line.match(
    new RegExp(String.raw`^subgraph\s+${ID_SOURCE}\s*\[\s*(?:${QUOTED_LABEL_SOURCE}|([^\]]+))\s*\]$`, "i"),
  );
  if (explicit?.[1] && (explicit[2] || explicit[3])) {
    return { id: resolveId(explicit[1]), label: unescapeLabel(explicit[2] ?? explicit[3] ?? "") };
  }

  const plain = line.match(/^subgraph\s+(.+)$/i);
  if (plain?.[1]) {
    const label = unquote(plain[1].trim());
    return { id: `group.${slugify(label)}`, label };
  }

  return undefined;
}

function parseEdge(
  line: string,
  resolveId: (alias: string) => string,
): ParsedEdgeExpression | undefined {
  const textLabelPatterns: Array<{
    regex: RegExp;
    operator: string;
  }> = [
    { regex: /^(?<left>.+?)\s*--\s*(?<label>.+?)\s*-->\s*(?<right>.+?)$/, operator: "-->" },
    { regex: /^(?<left>.+?)\s*<--\s*(?<label>.+?)\s*-->\s*(?<right>.+?)$/, operator: "<-->" },
    { regex: /^(?<left>.+?)\s*--\s*(?<label>.+?)\s*---\s*(?<right>.+?)$/, operator: "---" },
    { regex: /^(?<left>.+?)\s*-\.\s*(?<label>.+?)\s*\.->\s*(?<right>.+?)$/, operator: "-.->" },
    {
      regex: /^(?<left>.+?)\s*<-\.\s*(?<label>.+?)\s*\.->\s*(?<right>.+?)$/,
      operator: "<-.->",
    },
    { regex: /^(?<left>.+?)\s*-\.\s*(?<label>.+?)\s*\.-\s*(?<right>.+?)$/, operator: "-.-" },
    { regex: /^(?<left>.+?)\s*==\s*(?<label>.+?)\s*==>\s*(?<right>.+?)$/, operator: "==>" },
    { regex: /^(?<left>.+?)\s*<==\s*(?<label>.+?)\s*==>\s*(?<right>.+?)$/, operator: "<==>" },
    { regex: /^(?<left>.+?)\s*==\s*(?<label>.+?)\s*===\s*(?<right>.+?)$/, operator: "===" },
  ];

  for (const pattern of textLabelPatterns) {
    const match = line.match(pattern.regex);
    const parsed = match ? edgeFromMatch(match, pattern.operator, resolveId) : undefined;
    if (parsed) {
      return parsed;
    }
  }

  const pipeLabel = line.match(
    new RegExp(
      `^(?<left>.+?)\\s*(?<operator>${EDGE_OPERATOR_SOURCE})\\|(?<label>(?:\\\\.|[^|])*)\\|\\s*(?<right>.+?)$`,
    ),
  );
  const pipeParsed = pipeLabel
    ? edgeFromMatch(pipeLabel, pipeLabel.groups?.operator, resolveId)
    : undefined;
  if (pipeParsed) {
    return pipeParsed;
  }

  const plain = line.match(
    new RegExp(`^(?<left>.+?)\\s*(?<operator>${EDGE_OPERATOR_SOURCE})\\s*(?<right>.+?)$`),
  );
  return plain ? edgeFromMatch(plain, plain.groups?.operator, resolveId) : undefined;
}

function edgeFromMatch(
  match: RegExpMatchArray,
  operator: string | undefined,
  resolveId: (alias: string) => string,
): ParsedEdgeExpression | undefined {
  const operatorDefinition = operator ? edgeOperators[operator] : undefined;
  const left = match.groups?.left;
  const right = match.groups?.right;
  if (!operatorDefinition || !left || !right) {
    return undefined;
  }
  const from = parseNodeExpression(left.trim(), resolveId);
  const to = parseNodeExpression(right.trim(), resolveId);
  if (!from || !to) {
    return undefined;
  }
  const label = match.groups?.label?.trim();
  return {
    from,
    to,
    ...(label ? { label: unescapeLabel(unquote(label)) } : {}),
    type: operatorDefinition.type,
    arrow: operatorDefinition.arrow,
  };
}

function parseNodeExpression(
  input: string,
  resolveId: (alias: string) => string,
): ParsedNodeExpression | undefined {
  const trimmed = input.trim();

  const database = trimmed.match(
    new RegExp(String.raw`^${ID_SOURCE}\[\(\s*(?:${QUOTED_LABEL_SOURCE}|(.+?))\s*\)\]$`),
  );
  if (database?.[1] && (database[2] || database[3])) {
    return { id: resolveId(database[1]), label: unescapeLabel(database[2] ?? database[3] ?? ""), type: "database" };
  }

  const actor = trimmed.match(
    new RegExp(String.raw`^${ID_SOURCE}\(\(\s*(?:${QUOTED_LABEL_SOURCE}|(.+?))\s*\)\)$`),
  );
  if (actor?.[1] && (actor[2] || actor[3])) {
    return { id: resolveId(actor[1]), label: unescapeLabel(actor[2] ?? actor[3] ?? ""), type: "actor" };
  }

  const component = trimmed.match(
    new RegExp(String.raw`^${ID_SOURCE}\(\s*(?:${QUOTED_LABEL_SOURCE}|(.+?))\s*\)$`),
  );
  if (component?.[1] && (component[2] || component[3])) {
    return { id: resolveId(component[1]), label: unescapeLabel(component[2] ?? component[3] ?? ""), type: "component" };
  }

  const decision = trimmed.match(
    new RegExp(String.raw`^${ID_SOURCE}\{\{\s*(?:${QUOTED_LABEL_SOURCE}|(.+?))\s*\}\}$`),
  );
  if (decision?.[1] && (decision[2] || decision[3])) {
    return { id: resolveId(decision[1]), label: unescapeLabel(decision[2] ?? decision[3] ?? ""), type: "component" };
  }

  const external = trimmed.match(
    new RegExp(String.raw`^${ID_SOURCE}>\s*(?:${QUOTED_LABEL_SOURCE}|(.+?))\s*\]$`),
  );
  if (external?.[1] && (external[2] || external[3])) {
    return { id: resolveId(external[1]), label: unescapeLabel(external[2] ?? external[3] ?? ""), type: "external" };
  }

  const bracket = trimmed.match(
    new RegExp(String.raw`^${ID_SOURCE}\[\s*(?:${QUOTED_LABEL_SOURCE}|([^\]]+))\s*\]$`),
  );
  if (bracket?.[1] && (bracket[2] || bracket[3])) {
    return { id: resolveId(bracket[1]), label: unescapeLabel(bracket[2] ?? bracket[3] ?? ""), type: "service" };
  }

  const bare = trimmed.match(new RegExp(String.raw`^${ID_SOURCE}$`));
  if (bare?.[1]) {
    return { id: resolveId(bare[1]), type: "unknown" };
  }

  return undefined;
}

function ensureNode(
  nodes: Map<string, DiagramNode>,
  expression: ParsedNodeExpression,
  groupId: string | undefined,
): DiagramNode {
  const id = expression.id;
  const existing = nodes.get(id);
  if (existing) {
    const label = expression.label ?? existing.label;
    const type = existing.type === "unknown" ? expression.type : existing.type;
    const next = {
      ...existing,
      label,
      type,
      ...(groupId && !existing.groupId ? { groupId } : {}),
    };
    nodes.set(id, next);
    return next;
  }

  const node: DiagramNode = {
    id,
    type: expression.type,
    label: expression.label ?? id,
    ...(groupId ? { groupId } : {}),
    codeRefs: [],
    tags: [],
    metadata: {},
  };
  nodes.set(id, node);
  return node;
}

function activeGroup(groupStack: string[]): string | undefined {
  return groupStack.at(-1);
}

function addGroupNode(groups: Map<string, DiagramGroup>, groupId: string, nodeId: string): void {
  const group = groups.get(groupId);
  if (!group || group.nodeIds.includes(nodeId)) {
    return;
  }
  group.nodeIds.push(nodeId);
}

function edgeIdFor(
  hints: Array<{ id: string; from: string; to: string }>,
  hintIndex: number,
  from: string,
  to: string,
  existingEdges: DiagramEdge[],
): string {
  const exactHint = hints[hintIndex];
  const existingIds = existingEdges.map((item) => item.id);
  if (exactHint?.from === from && exactHint.to === to) {
    return uniqueId(exactHint.id, existingIds);
  }

  const fallbackHint = hints.find(
    (hint) => hint.from === from && hint.to === to && !existingIds.includes(hint.id),
  );
  return uniqueId(fallbackHint?.id ?? `edge.${from}.${to}`, existingIds);
}

function uniqueId(base: string, existing: string[]): string {
  const normalized = base.replace(/[^A-Za-z0-9_.:-]+/g, "_").replace(/_+/g, "_");
  if (!existing.includes(normalized)) {
    return normalized;
  }
  let index = 2;
  while (existing.includes(`${normalized}.${index}`)) {
    index += 1;
  }
  return `${normalized}.${index}`;
}

function tokenizeMermaid(source: string): MermaidStatement[] {
  const statements: MermaidStatement[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  for (const rawLine of lines) {
    const { body, comment } = splitInlineComment(rawLine);
    for (const statement of splitStatements(body)) {
      const text = statement.trim();
      if (text) {
        statements.push({ text, raw: statement, comment: false });
      }
    }
    if (comment) {
      statements.push({ text: comment.trim(), raw: rawLine, comment: true });
    }
  }

  return statements;
}

function splitInlineComment(line: string): { body: string; comment?: string } {
  for (let index = 0; index < line.length - 1; index += 1) {
    if (line[index] === "%" && line[index + 1] === "%" && !isEscaped(line, index) && !isInsideQuote(line, index)) {
      return { body: line.slice(0, index), comment: line.slice(index + 2) };
    }
  }
  return { body: line };
}

function splitStatements(line: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: string | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === "\"" || char === "'") && !isEscaped(line, index)) {
      quote = quote === char ? null : quote ?? char;
      continue;
    }
    if (char === ";" && !quote) {
      statements.push(line.slice(start, index));
      start = index + 1;
    }
  }

  statements.push(line.slice(start));
  return statements;
}

function isInsideQuote(line: string, targetIndex: number): boolean {
  let quote: string | null = null;
  for (let index = 0; index < targetIndex; index += 1) {
    const char = line[index];
    if ((char === "\"" || char === "'") && !isEscaped(line, index)) {
      quote = quote === char ? null : quote ?? char;
    }
  }
  return Boolean(quote);
}

function isEscaped(line: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function unescapeLabel(value: string): string {
  return value
    .trim()
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\|/g, "|")
    .replace(/\\\]/g, "]")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function metadataSlug(metadata: Record<string, unknown> | undefined): string | undefined {
  return typeof metadata?.slug === "string" ? metadata.slug : undefined;
}

function isAgentData(value: unknown): value is AgentCanvasMermaidData {
  return Boolean(value && typeof value === "object" && "version" in value && value.version === 1);
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "diagram"
  );
}
