import { autoLayout } from "../layout/autoLayout.js";
import { DiagramDocumentSchema, SCHEMA_VERSION, type DiagramDocument } from "../schema/diagram.js";

export function createSampleDiagram(): DiagramDocument {
  const now = new Date().toISOString();
  const document: DiagramDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: "diagram.system_overview",
    title: "System Overview",
    description: "A sample local-first web service architecture used to explore AgentCanvas.",
    createdAt: now,
    updatedAt: now,
    direction: "LR",
    nodes: [
      node("node.client", "actor", "Client"),
      node("node.web_app", "component", "Web App"),
      node("node.api_gateway", "service", "API Gateway"),
      node("node.auth_service", "service", "Auth Service"),
      node("node.user_service", "service", "User Service"),
      node("node.redis_cache", "cache", "Redis Cache"),
      node("node.postgresql", "database", "PostgreSQL"),
      node("node.job_queue", "queue", "Job Queue"),
      node("node.worker", "component", "Worker"),
      node("node.payment_api", "external", "External Payment API"),
    ],
    edges: [
      edge("node.client", "node.web_app"),
      edge("node.web_app", "node.api_gateway"),
      edge("node.api_gateway", "node.auth_service"),
      edge("node.api_gateway", "node.user_service"),
      edge("node.user_service", "node.redis_cache"),
      edge("node.user_service", "node.postgresql"),
      edge("node.user_service", "node.job_queue"),
      edge("node.job_queue", "node.worker"),
      edge("node.worker", "node.payment_api"),
    ],
    groups: [
      {
        id: "group.backend",
        label: "Backend",
        nodeIds: [
          "node.api_gateway",
          "node.auth_service",
          "node.user_service",
          "node.redis_cache",
          "node.postgresql",
          "node.job_queue",
          "node.worker",
        ],
        metadata: {},
      },
    ],
    notes: [
      {
        id: "note.redis_ttl",
        text: "RedisのTTL方針が未定義",
        targetId: "node.redis_cache",
        kind: "warning",
      },
      {
        id: "note.payment_retry",
        text: "Payment API失敗時のretry/backoffが必要",
        targetId: "node.payment_api",
        kind: "risk",
      },
    ],
    tasks: [
      {
        id: "task.auth_coderef",
        title: "Auth Service の codeRef を追加",
        status: "todo",
        targetId: "node.auth_service",
      },
      {
        id: "task.redis_fallback",
        title: "Redis fallback設計を書く",
        status: "todo",
        targetId: "node.redis_cache",
      },
      {
        id: "task.worker_retry",
        title: "Worker retry policy を決める",
        status: "todo",
        targetId: "node.worker",
      },
    ],
    comments: [],
    layout: { nodes: {}, edges: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    proposals: [],
    metadata: { slug: "system-overview", sample: true },
  };

  return DiagramDocumentSchema.parse(autoLayout(document));
}

function node(id: string, type: DiagramDocument["nodes"][number]["type"], label: string) {
  return {
    id,
    type,
    label,
    codeRefs: [],
    tags: [],
    metadata: {},
  };
}

function edge(from: string, to: string) {
  return {
    id: `edge.${from.replace(/^node\./, "")}.${to.replace(/^node\./, "")}`,
    from,
    to,
    type: "sync" as const,
    arrow: "directed" as const,
    metadata: {},
  };
}
