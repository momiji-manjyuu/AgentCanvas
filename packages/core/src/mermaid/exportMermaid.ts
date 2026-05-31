import type { DiagramDocument, DiagramEdge, DiagramNode } from "../schema/diagram.js";

export function exportMermaid(document: DiagramDocument): string {
  const direction = document.direction === "TB" ? "TD" : document.direction;
  const lines = [`flowchart ${direction}`];
  const emitted = new Set<string>();

  for (const group of document.groups) {
    lines.push(`  subgraph ${toMermaidId(group.id)}["${escapeLabel(group.label)}"]`);
    for (const nodeId of group.nodeIds) {
      const node = document.nodes.find((candidate) => candidate.id === nodeId);
      if (node) {
        lines.push(`    ${nodeDefinition(node)}`);
        emitted.add(node.id);
      }
    }
    lines.push("  end");
    lines.push("");
  }

  for (const node of document.nodes) {
    if (!emitted.has(node.id)) {
      lines.push(`  ${nodeDefinition(node)}`);
    }
  }

  if (document.nodes.length > 0 && document.edges.length > 0) {
    lines.push("");
  }

  for (const edge of document.edges) {
    lines.push(`  ${edgeDefinition(edge)}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function nodeDefinition(node: DiagramNode): string {
  const id = toMermaidId(node.id);
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

function edgeDefinition(edge: DiagramEdge): string {
  const from = toMermaidId(edge.from);
  const to = toMermaidId(edge.to);
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

function toMermaidId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([0-9])/, "_$1");
}

function escapeLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
