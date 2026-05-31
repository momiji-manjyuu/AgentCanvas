import { z } from "zod";

export const DiagramDirectionSchema = z.enum(["LR", "TD", "TB", "RL", "BT"]);
export const DiagramNodeTypeSchema = z.enum([
  "actor",
  "service",
  "component",
  "database",
  "cache",
  "queue",
  "external",
  "unknown",
]);
export const DiagramEdgeTypeSchema = z.enum([
  "sync",
  "async",
  "dependency",
  "data",
  "control",
  "unknown",
]);
export const DiagramEdgeArrowSchema = z.enum(["directed", "bidirectional", "none"]);
export const DiagramNoteKindSchema = z.enum(["note", "warning", "decision", "risk"]);
export const DiagramTaskStatusSchema = z.enum(["todo", "in_progress", "done", "blocked"]);
export const DiagramProposalStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "partially_accepted",
]);

export const JsonMetadataSchema: z.ZodType<Record<string, unknown>> = z.record(z.unknown());

export const CodeRefSchema = z.object({
  path: z.string().min(1),
  symbol: z.string().min(1).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

export const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  type: DiagramNodeTypeSchema,
  label: z.string().min(1),
  description: z.string().optional(),
  groupId: z.string().min(1).optional(),
  codeRefs: z.array(CodeRefSchema).default([]),
  tags: z.array(z.string()).default([]),
  metadata: JsonMetadataSchema.default({}),
});

export const DiagramEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  type: DiagramEdgeTypeSchema,
  arrow: DiagramEdgeArrowSchema.default("directed"),
  metadata: JsonMetadataSchema.default({}),
});

export const DiagramGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).default([]),
  collapsed: z.boolean().optional(),
  metadata: JsonMetadataSchema.default({}),
});

export const DiagramNoteSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  targetId: z.string().min(1).optional(),
  kind: DiagramNoteKindSchema,
});

export const DiagramTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: DiagramTaskStatusSchema,
  targetId: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const DiagramCommentSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  targetId: z.string().min(1).optional(),
  author: z.string().min(1),
  resolved: z.boolean(),
  createdAt: z.string().datetime(),
});

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const NodeLayoutSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  locked: z.boolean().optional(),
});

export const EdgeLayoutSchema = z.object({
  points: z.array(PointSchema).optional(),
});

export const DiagramLayoutSchema = z.object({
  nodes: z.record(NodeLayoutSchema).default({}),
  edges: z.record(EdgeLayoutSchema).default({}),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number().positive(),
    })
    .optional(),
});

const NodePatchSchema = DiagramNodeSchema;
const EdgePatchSchema = DiagramEdgeSchema;
const GroupPatchSchema = DiagramGroupSchema;
const NotePatchSchema = DiagramNoteSchema;
const TaskPatchSchema = DiagramTaskSchema;
const CommentPatchSchema = DiagramCommentSchema;

export const DiagramPatchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_node"),
    node: NodePatchSchema,
    layout: NodeLayoutSchema.optional(),
  }),
  z.object({
    op: z.literal("update_node"),
    id: z.string().min(1),
    updates: NodePatchSchema.partial().omit({ id: true }),
  }),
  z.object({ op: z.literal("delete_node"), id: z.string().min(1) }),
  z.object({ op: z.literal("move_node"), id: z.string().min(1), position: PointSchema }),
  z.object({
    op: z.literal("add_edge"),
    edge: EdgePatchSchema,
    layout: EdgeLayoutSchema.optional(),
  }),
  z.object({
    op: z.literal("update_edge"),
    id: z.string().min(1),
    updates: EdgePatchSchema.partial().omit({ id: true }),
  }),
  z.object({ op: z.literal("delete_edge"), id: z.string().min(1) }),
  z.object({ op: z.literal("add_group"), group: GroupPatchSchema }),
  z.object({
    op: z.literal("update_group"),
    id: z.string().min(1),
    updates: GroupPatchSchema.partial().omit({ id: true }),
  }),
  z.object({ op: z.literal("delete_group"), id: z.string().min(1) }),
  z.object({ op: z.literal("add_note"), note: NotePatchSchema }),
  z.object({
    op: z.literal("update_note"),
    id: z.string().min(1),
    updates: NotePatchSchema.partial().omit({ id: true }),
  }),
  z.object({ op: z.literal("delete_note"), id: z.string().min(1) }),
  z.object({ op: z.literal("add_task"), task: TaskPatchSchema }),
  z.object({
    op: z.literal("update_task"),
    id: z.string().min(1),
    updates: TaskPatchSchema.partial().omit({ id: true }),
  }),
  z.object({ op: z.literal("delete_task"), id: z.string().min(1) }),
  z.object({ op: z.literal("add_comment"), comment: CommentPatchSchema }),
  z.object({ op: z.literal("resolve_comment"), id: z.string().min(1) }),
  z.object({ op: z.literal("set_layout"), layout: DiagramLayoutSchema }),
  z.object({ op: z.literal("set_direction"), direction: DiagramDirectionSchema }),
]);

export const DiagramProposalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  createdAt: z.string().datetime(),
  author: z.string().min(1),
  status: DiagramProposalStatusSchema,
  ops: z.array(DiagramPatchOpSchema),
  risks: z.array(z.string()).optional(),
  rationale: z.string().optional(),
});

export const DiagramDocumentSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    direction: DiagramDirectionSchema,
    nodes: z.array(DiagramNodeSchema).default([]),
    edges: z.array(DiagramEdgeSchema).default([]),
    groups: z.array(DiagramGroupSchema).default([]),
    notes: z.array(DiagramNoteSchema).default([]),
    tasks: z.array(DiagramTaskSchema).default([]),
    comments: z.array(DiagramCommentSchema).default([]),
    layout: DiagramLayoutSchema.default({ nodes: {}, edges: {} }),
    proposals: z.array(DiagramProposalSchema).default([]),
    metadata: JsonMetadataSchema.default({}),
  })
  .superRefine((document, ctx) => {
    const nodeIds = new Set(document.nodes.map((node) => node.id));
    for (const edge of document.edges) {
      if (!nodeIds.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge ${edge.id} references missing source node ${edge.from}`,
          path: ["edges", edge.id, "from"],
        });
      }
      if (!nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge ${edge.id} references missing target node ${edge.to}`,
          path: ["edges", edge.id, "to"],
        });
      }
    }

    for (const group of document.groups) {
      for (const nodeId of group.nodeIds) {
        if (!nodeIds.has(nodeId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Group ${group.id} references missing node ${nodeId}`,
            path: ["groups", group.id, "nodeIds"],
          });
        }
      }
    }
  });

export type DiagramDirection = z.infer<typeof DiagramDirectionSchema>;
export type DiagramNodeType = z.infer<typeof DiagramNodeTypeSchema>;
export type DiagramEdgeType = z.infer<typeof DiagramEdgeTypeSchema>;
export type DiagramEdgeArrow = z.infer<typeof DiagramEdgeArrowSchema>;
export type DiagramNoteKind = z.infer<typeof DiagramNoteKindSchema>;
export type DiagramTaskStatus = z.infer<typeof DiagramTaskStatusSchema>;
export type DiagramProposalStatus = z.infer<typeof DiagramProposalStatusSchema>;
export type CodeRef = z.infer<typeof CodeRefSchema>;
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;
export type DiagramGroup = z.infer<typeof DiagramGroupSchema>;
export type DiagramNote = z.infer<typeof DiagramNoteSchema>;
export type DiagramTask = z.infer<typeof DiagramTaskSchema>;
export type DiagramComment = z.infer<typeof DiagramCommentSchema>;
export type Point = z.infer<typeof PointSchema>;
export type NodeLayout = z.infer<typeof NodeLayoutSchema>;
export type EdgeLayout = z.infer<typeof EdgeLayoutSchema>;
export type DiagramLayout = z.infer<typeof DiagramLayoutSchema>;
export type DiagramPatchOp = z.infer<typeof DiagramPatchOpSchema>;
export type DiagramProposal = z.infer<typeof DiagramProposalSchema>;
export type DiagramDocument = z.infer<typeof DiagramDocumentSchema>;

export const SCHEMA_VERSION = "0.1.0" as const;
