import type { DiagramDocument, DiagramEdge, DiagramNode } from "../schema/diagram.js";
import {
  createMermaidIdMap,
  formatAgentCanvasDataComment,
  formatIdMappingComment,
} from "./idMapping.js";

interface AgentCanvasMermaidData {
  version: 1;
  document: {
    id: string;
    title: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
  };
  edgeIds: Array<{ id: string; from: string; to: string }>;
  notes: DiagramDocument["notes"];
  tasks: DiagramDocument["tasks"];
  comments: DiagramDocument["comments"];
  layout: DiagramDocument["layout"];
  proposals: DiagramDocument["proposals"];
  metadata: DiagramDocument["metadata"];
}

export function exportMermaid(document: DiagramDocument): string {
  const direction = document.direction === "TB" ? "TD" : document.direction;
  const idMap = createMermaidIdMap([
    ...document.nodes.map((node) => node.id),
    ...document.groups.map((group) => group.id),
  ]);
  const lines = [`flowchart ${direction}`];
  const emitted = new Set<string>();

  for (const entry of idMap.entries) {
    if (entry.alias !== entry.original) {
      lines.push(formatIdMappingComment(entry));
    }
  }

  lines.push(formatAgentCanvasDataComment(exportedData(document)));

  for (const group of document.groups) {
    lines.push(`  subgraph ${idMap.toAlias(group.id)}["${escapeLabel(group.label)}"]`);
    for (const nodeId of group.nodeIds) {
      const node = document.nodes.find((candidate) => candidate.id === nodeId);
      if (node) {
        lines.push(`    ${nodeDefinition(node, idMap.toAlias(node.id))}`);
        emitted.add(node.id);
      }
    }
    lines.push("  end");
    lines.push("");
  }

  for (const node of document.nodes) {
    if (!emitted.has(node.id)) {
      lines.push(`  ${nodeDefinition(node, idMap.toAlias(node.id))}`);
    }
  }

  if (document.nodes.length > 0 && document.edges.length > 0) {
    lines.push("");
  }

  for (const edge of document.edges) {
    lines.push(`  ${edgeDefinition(edge, idMap.toAlias(edge.from), idMap.toAlias(edge.to))}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function nodeDefinition(node: DiagramNode, id: string): string {
  const label = escapeLabel(node.label);

  switch (node.type) {
    case "actor":
      return `${id}(("${label}"))`;
    case "database":
      return `${id}[("${label}")]`;
    case "external":
      return `${id}>"${label}"]`;
    case "cache":
      return `${id}[("${label}")]`;
    case "queue":
      return `${id}["${label}"]`;
    case "component":
      return `${id}("${label}")`;
    case "service":
    case "unknown":
      return `${id}["${label}"]`;
  }
}

function edgeDefinition(edge: DiagramEdge, from: string, to: string): string {
  const label = edge.label ? escapeLabel(edge.label) : undefined;
  const operator = edgeOperator(edge);

  return label ? `${from} ${operator}|${label}| ${to}` : `${from} ${operator} ${to}`;
}

function edgeOperator(edge: DiagramEdge): string {
  const arrow = edge.arrow ?? "directed";
  if (edge.type === "async") {
    if (arrow === "bidirectional") {
      return "<-.->";
    }
    return arrow === "none" ? "-.-" : "-.->";
  }

  if (edge.type === "dependency") {
    if (arrow === "bidirectional") {
      return "<==>";
    }
    return arrow === "none" ? "===" : "==>";
  }

  if (arrow === "bidirectional") {
    return "<-->";
  }
  return arrow === "none" ? "---" : "-->";
}

function escapeLabel(label: string): string {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')
    .replace(/\|/g, "\\|")
    .replace(/\]/g, "\\]");
}

function exportedData(document: DiagramDocument): AgentCanvasMermaidData {
  return {
    version: 1,
    document: {
      id: document.id,
      title: document.title,
      ...(document.description ? { description: document.description } : {}),
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    },
    edgeIds: document.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })),
    notes: document.notes,
    tasks: document.tasks,
    comments: document.comments,
    layout: document.layout,
    proposals: document.proposals,
    metadata: document.metadata,
  };
}
