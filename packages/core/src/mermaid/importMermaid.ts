import { nanoid } from "nanoid";
import { autoLayout } from "../layout/autoLayout.js";
import {
  type DiagramDocument,
  type DiagramEdgeArrow,
  type DiagramEdge,
  type DiagramEdgeType,
  type DiagramGroup,
  type DiagramNode,
  type DiagramNodeType,
  SCHEMA_VERSION,
  DiagramDocumentSchema,
} from "../schema/diagram.js";

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
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const groups = new Map<string, DiagramGroup>();
  const groupStack: string[] = [];
  const unsupportedMermaidLines: string[] = [];
  const mermaidComments: string[] = [];
  let direction: DiagramDocument["direction"] = "LR";

  const lines = source.replace(/\r\n/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("%%")) {
      mermaidComments.push(line.replace(/^%%\s?/, ""));
      continue;
    }

    const flowchart = line.match(/^(flowchart|graph)\s+(LR|TD|TB|RL|BT)\s*;?$/i);
    if (flowchart?.[2]) {
      direction = flowchart[2].toUpperCase() as DiagramDocument["direction"];
      continue;
    }

    const subgraph = parseSubgraph(line);
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

    if (/^end;?$/i.test(line)) {
      groupStack.pop();
      continue;
    }

    const edge = parseEdge(line);
    if (edge) {
      const from = ensureNode(nodes, edge.from, activeGroup(groupStack));
      const to = ensureNode(nodes, edge.to, activeGroup(groupStack));
      const groupId = activeGroup(groupStack);
      if (groupId) {
        addGroupNode(groups, groupId, from.id);
        addGroupNode(groups, groupId, to.id);
      }
      edges.push({
        id: uniqueId(
          `edge.${from.id}.${to.id}`,
          edges.map((item) => item.id),
        ),
        from: from.id,
        to: to.id,
        ...(edge.label ? { label: edge.label } : {}),
        type: edge.type,
        arrow: edge.arrow,
        metadata: {},
      });
      continue;
    }

    const nodeExpression = parseNodeExpression(line.replace(/;$/, ""));
    if (nodeExpression) {
      const node = ensureNode(nodes, nodeExpression, activeGroup(groupStack));
      const groupId = activeGroup(groupStack);
      if (groupId) {
        addGroupNode(groups, groupId, node.id);
      }
      continue;
    }

    unsupportedMermaidLines.push(rawLine);
  }

  const document: DiagramDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? `diagram.${slugify(options.title ?? "imported-diagram")}.${nanoid(6)}`,
    title: options.title ?? "Imported Diagram",
    createdAt: now,
    updatedAt: now,
    direction,
    nodes: [...nodes.values()],
    edges,
    groups: [...groups.values()],
    notes: unsupportedMermaidLines.map((text, index) => ({
      id: `note.unsupported_mermaid.${index + 1}`,
      text: `Unsupported Mermaid line: ${text.trim()}`,
      kind: "warning",
    })),
    tasks: [],
    comments: [],
    layout: { nodes: {}, edges: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    proposals: [],
    metadata: {
      importedFrom: "mermaid",
      unsupportedMermaidLines,
      mermaidComments,
      slug: options.slug ?? slugify(options.title ?? "imported-diagram"),
    },
  };

  return DiagramDocumentSchema.parse(autoLayout(document));
}

function parseSubgraph(line: string): { id: string; label: string } | undefined {
  const explicit = line.match(/^subgraph\s+([A-Za-z0-9_.:-]+)\s*\[\s*"?([^"\]]+)"?\s*\]\s*;?$/i);
  if (explicit?.[1] && explicit[2]) {
    return { id: explicit[1], label: explicit[2] };
  }

  const plain = line.match(/^subgraph\s+(.+?)\s*;?$/i);
  if (plain?.[1]) {
    const label = unquote(plain[1].trim());
    return { id: `group.${slugify(label)}`, label };
  }

  return undefined;
}

function parseEdge(line: string): ParsedEdgeExpression | undefined {
  const textLabelPatterns: Array<{
    regex: RegExp;
    operator: string;
  }> = [
    { regex: /^(?<left>.+?)\s*--\s*(?<label>.+?)\s*-->\s*(?<right>.+?)\s*;?$/, operator: "-->" },
    { regex: /^(?<left>.+?)\s*<--\s*(?<label>.+?)\s*-->\s*(?<right>.+?)\s*;?$/, operator: "<-->" },
    { regex: /^(?<left>.+?)\s*--\s*(?<label>.+?)\s*---\s*(?<right>.+?)\s*;?$/, operator: "---" },
    { regex: /^(?<left>.+?)\s*-\.\s*(?<label>.+?)\s*\.->\s*(?<right>.+?)\s*;?$/, operator: "-.->" },
    {
      regex: /^(?<left>.+?)\s*<-\.\s*(?<label>.+?)\s*\.->\s*(?<right>.+?)\s*;?$/,
      operator: "<-.->",
    },
    { regex: /^(?<left>.+?)\s*-\.\s*(?<label>.+?)\s*\.-\s*(?<right>.+?)\s*;?$/, operator: "-.-" },
    { regex: /^(?<left>.+?)\s*==\s*(?<label>.+?)\s*==>\s*(?<right>.+?)\s*;?$/, operator: "==>" },
    { regex: /^(?<left>.+?)\s*<==\s*(?<label>.+?)\s*==>\s*(?<right>.+?)\s*;?$/, operator: "<==>" },
    { regex: /^(?<left>.+?)\s*==\s*(?<label>.+?)\s*===\s*(?<right>.+?)\s*;?$/, operator: "===" },
  ];

  for (const pattern of textLabelPatterns) {
    const match = line.match(pattern.regex);
    const parsed = match ? edgeFromMatch(match, pattern.operator) : undefined;
    if (parsed) {
      return parsed;
    }
  }

  const pipeLabel = line.match(
    new RegExp(
      `^(?<left>.+?)\\s*(?<operator>${EDGE_OPERATOR_SOURCE})\\|(?<label>[^|]+)\\|\\s*(?<right>.+?)\\s*;?$`,
    ),
  );
  const pipeParsed = pipeLabel ? edgeFromMatch(pipeLabel, pipeLabel.groups?.operator) : undefined;
  if (pipeParsed) {
    return pipeParsed;
  }

  const plain = line.match(
    new RegExp(`^(?<left>.+?)\\s*(?<operator>${EDGE_OPERATOR_SOURCE})\\s*(?<right>.+?)\\s*;?$`),
  );
  return plain ? edgeFromMatch(plain, plain.groups?.operator) : undefined;
}

function edgeFromMatch(
  match: RegExpMatchArray,
  operator: string | undefined,
): ParsedEdgeExpression | undefined {
  const operatorDefinition = operator ? edgeOperators[operator] : undefined;
  const left = match.groups?.left;
  const right = match.groups?.right;
  if (!operatorDefinition || !left || !right) {
    return undefined;
  }
  const from = parseNodeExpression(left.trim());
  const to = parseNodeExpression(right.trim());
  if (!from || !to) {
    return undefined;
  }
  const label = match.groups?.label?.trim();
  return {
    from,
    to,
    ...(label ? { label: unquote(label) } : {}),
    type: operatorDefinition.type,
    arrow: operatorDefinition.arrow,
  };
}

function parseNodeExpression(input: string): ParsedNodeExpression | undefined {
  const trimmed = input.trim();
  const database = trimmed.match(/^([A-Za-z0-9_.:-]+)\[\(\s*"?(.+?)"?\s*\)\]$/);
  if (database?.[1] && database[2]) {
    return { id: database[1], label: unquote(database[2]), type: "database" };
  }

  const actor = trimmed.match(/^([A-Za-z0-9_.:-]+)\(\(\s*"?(.+?)"?\s*\)\)$/);
  if (actor?.[1] && actor[2]) {
    return { id: actor[1], label: unquote(actor[2]), type: "actor" };
  }

  const component = trimmed.match(/^([A-Za-z0-9_.:-]+)\(\s*"?(.+?)"?\s*\)$/);
  if (component?.[1] && component[2]) {
    return { id: component[1], label: unquote(component[2]), type: "component" };
  }

  const decision = trimmed.match(/^([A-Za-z0-9_.:-]+)\{\{\s*"?(.+?)"?\s*\}\}$/);
  if (decision?.[1] && decision[2]) {
    return { id: decision[1], label: unquote(decision[2]), type: "component" };
  }

  const external = trimmed.match(/^([A-Za-z0-9_.:-]+)>\s*"?(.+?)"?\s*\]$/);
  if (external?.[1] && external[2]) {
    return { id: external[1], label: unquote(external[2]), type: "external" };
  }

  const bracket = trimmed.match(/^([A-Za-z0-9_.:-]+)\[\s*"?(.+?)"?\s*\]$/);
  if (bracket?.[1] && bracket[2]) {
    return { id: bracket[1], label: unquote(bracket[2]), type: "service" };
  }

  const bare = trimmed.match(/^([A-Za-z0-9_.:-]+)$/);
  if (bare?.[1]) {
    return { id: bare[1], type: "unknown" };
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

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
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
