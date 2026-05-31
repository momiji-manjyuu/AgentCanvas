import { nanoid } from "nanoid";
import type {
  DiagramDocument,
  DiagramPatchOp,
  DiagramProposal,
  NodeLayout,
} from "../schema/diagram.js";

export function createRedisCacheProposal(document: DiagramDocument): DiagramProposal {
  const now = new Date().toISOString();
  const anchor =
    document.nodes.find((node) => /user service/i.test(node.label)) ??
    document.nodes.find((node) => /api gateway/i.test(node.label)) ??
    document.nodes[0];
  const database = document.nodes.find(
    (node) => node.type === "database" || /database|postgres/i.test(node.label),
  );
  const anchorLayout = anchor ? document.layout.nodes[anchor.id] : undefined;
  const redisId = uniqueNodeId(document, "node.redis_cache");
  const redisLayout: NodeLayout = {
    x: (anchorLayout?.x ?? 220) + 260,
    y: (anchorLayout?.y ?? 120) + 24,
    width: 190,
    height: 76,
  };
  const ops: DiagramPatchOp[] = [
    {
      op: "add_node",
      node: {
        id: redisId,
        type: "cache",
        label: "Redis Cache",
        description: "Proposed low-latency cache for hot user reads.",
        codeRefs: [],
        tags: ["proposal"],
        metadata: {},
      },
      layout: redisLayout,
    },
  ];

  if (anchor) {
    ops.push({
      op: "add_edge",
      edge: {
        id: uniqueEdgeId(document, `edge.${anchor.id}.${redisId}`),
        from: anchor.id,
        to: redisId,
        label: "read/write cache",
        type: "data",
        arrow: "directed",
        metadata: {},
      },
    });
  }

  if (database) {
    ops.push({
      op: "add_edge",
      edge: {
        id: uniqueEdgeId(document, `edge.${redisId}.${database.id}`),
        from: redisId,
        to: database.id,
        label: "cache miss",
        type: "data",
        arrow: "directed",
        metadata: {},
      },
    });
  }

  ops.push(
    {
      op: "add_note",
      note: {
        id: `note.cache_invalidation.${nanoid(5)}`,
        text: "Cache invalidation policy is not defined yet.",
        targetId: redisId,
        kind: "warning",
      },
    },
    {
      op: "add_task",
      task: {
        id: `task.redis_fallback.${nanoid(5)}`,
        title: "Define Redis fallback and invalidation policy",
        status: "todo",
        targetId: redisId,
        description: "Document TTL, cache miss, and stale read behavior before implementation.",
      },
    },
  );

  return {
    id: `proposal.redis_cache.${nanoid(8)}`,
    title: "Add Redis Cache",
    summary:
      "Adds a Redis cache node, cache read/write edge, cache miss edge, warning note, and follow-up task.",
    createdAt: now,
    author: "agent",
    status: "pending",
    ops,
    risks: ["Cache invalidation and stale reads need explicit design before implementation."],
    rationale:
      "The graph already has request and persistence paths; adding cache as a proposal lets humans review the operational tradeoff first.",
  };
}

function uniqueNodeId(document: DiagramDocument, base: string): string {
  const ids = new Set(document.nodes.map((node) => node.id));
  if (!ids.has(base)) {
    return base;
  }
  let index = 2;
  while (ids.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

function uniqueEdgeId(document: DiagramDocument, base: string): string {
  const ids = new Set(document.edges.map((edge) => edge.id));
  if (!ids.has(base)) {
    return base;
  }
  let index = 2;
  while (ids.has(`${base}.${index}`)) {
    index += 1;
  }
  return `${base}.${index}`;
}
