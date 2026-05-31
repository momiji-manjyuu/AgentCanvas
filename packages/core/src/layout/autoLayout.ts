import type { DiagramDocument, DiagramLayout, NodeLayout, Point } from "../schema/diagram.js";

export interface AutoLayoutOptions {
  preserveLocked?: boolean;
  focusNodeIds?: string[];
}

const NODE_WIDTH = 190;
const NODE_HEIGHT = 76;
const X_GAP = 110;
const Y_GAP = 70;

export function createGridLayout(document: DiagramDocument): DiagramLayout {
  const columns = Math.max(1, Math.ceil(Math.sqrt(document.nodes.length)));
  const nodes: Record<string, NodeLayout> = {};

  document.nodes.forEach((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    nodes[node.id] = {
      x: column * (NODE_WIDTH + X_GAP),
      y: row * (NODE_HEIGHT + Y_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  return { nodes, edges: {}, viewport: { x: 0, y: 0, zoom: 1 } };
}

export function autoLayout(document: DiagramDocument, options: AutoLayoutOptions = {}): DiagramDocument {
  try {
    const existing = document.layout.nodes;
    const ranked = rankNodes(document);
    const rows = new Map<number, string[]>();

    for (const [nodeId, rank] of ranked) {
      const row = rows.get(rank) ?? [];
      row.push(nodeId);
      rows.set(rank, row);
    }

    const nextLayout: DiagramLayout = {
      nodes: {},
      edges: { ...document.layout.edges },
      viewport: document.layout.viewport ?? { x: 0, y: 0, zoom: 1 },
    };

    for (const [rank, nodeIds] of [...rows.entries()].sort(([a], [b]) => a - b)) {
      nodeIds.sort((a, b) => a.localeCompare(b));
      nodeIds.forEach((nodeId, index) => {
        const current = existing[nodeId];
        if (options.preserveLocked && current?.locked) {
          nextLayout.nodes[nodeId] = current;
          return;
        }

        const point = pointFor(document.direction, rank, index);
        nextLayout.nodes[nodeId] = {
          x: point.x,
          y: point.y,
          width: current?.width ?? NODE_WIDTH,
          height: current?.height ?? NODE_HEIGHT,
          ...(current?.locked ? { locked: current.locked } : {}),
        };
      });
    }

    for (const node of document.nodes) {
      if (!nextLayout.nodes[node.id]) {
        const fallback = createGridLayout(document).nodes[node.id];
        if (fallback) {
          nextLayout.nodes[node.id] = fallback;
        }
      }
    }

    return {
      ...document,
      layout: nextLayout,
    };
  } catch {
    return {
      ...document,
      layout: createGridLayout(document),
    };
  }
}

export function placeAddedNodesNearConnections(
  base: DiagramDocument,
  preview: DiagramDocument,
): DiagramDocument {
  const layout: DiagramLayout = {
    nodes: { ...preview.layout.nodes },
    edges: { ...preview.layout.edges },
    viewport: preview.layout.viewport,
  };

  for (const node of preview.nodes) {
    if (layout.nodes[node.id]) {
      continue;
    }

    const connectedEdge = preview.edges.find((edge) => edge.from === node.id || edge.to === node.id);
    const neighborId =
      connectedEdge?.from === node.id ? connectedEdge.to : connectedEdge?.to === node.id ? connectedEdge.from : undefined;
    const neighbor = neighborId ? base.layout.nodes[neighborId] : undefined;

    if (neighbor) {
      layout.nodes[node.id] = {
        x: neighbor.x + NODE_WIDTH + 90,
        y: neighbor.y + 32,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    } else {
      const grid = createGridLayout(preview).nodes[node.id];
      if (grid) {
        layout.nodes[node.id] = grid;
      }
    }
  }

  return { ...preview, layout };
}

function rankNodes(document: DiagramDocument): Map<string, number> {
  const rank = new Map<string, number>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of document.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of document.edges) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) {
      continue;
    }
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = [...incoming.entries()]
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId)
    .sort((a, b) => a.localeCompare(b));

  for (const nodeId of queue) {
    rank.set(nodeId, 0);
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) {
      break;
    }
    const currentRank = rank.get(nodeId) ?? 0;
    for (const next of outgoing.get(nodeId) ?? []) {
      const proposedRank = currentRank + 1;
      if ((rank.get(next) ?? -1) < proposedRank) {
        rank.set(next, proposedRank);
      }
      incoming.set(next, Math.max(0, (incoming.get(next) ?? 1) - 1));
      if (incoming.get(next) === 0) {
        queue.push(next);
      }
    }
  }

  let fallbackRank = 0;
  for (const node of document.nodes) {
    if (!rank.has(node.id)) {
      rank.set(node.id, fallbackRank);
      fallbackRank += 1;
    }
  }

  return rank;
}

function pointFor(direction: DiagramDocument["direction"], rank: number, index: number): Point {
  const x = rank * (NODE_WIDTH + X_GAP);
  const y = index * (NODE_HEIGHT + Y_GAP);

  if (direction === "TD" || direction === "TB") {
    return { x: index * (NODE_WIDTH + X_GAP), y: rank * (NODE_HEIGHT + Y_GAP) };
  }
  if (direction === "RL") {
    return { x: -x, y };
  }
  if (direction === "BT") {
    return { x: index * (NODE_WIDTH + X_GAP), y: -rank * (NODE_HEIGHT + Y_GAP) };
  }
  return { x, y };
}
