import {
  DiagramDocumentSchema,
  type DiagramDocument,
  type DiagramPatchOp,
  type DiagramProposal,
} from "../schema/diagram.js";

export interface ApplyPatchOptions {
  updateTimestamp?: boolean;
}

export function applyPatch(
  document: DiagramDocument,
  ops: DiagramPatchOp[],
  options: ApplyPatchOptions = {},
): DiagramDocument {
  const next = DiagramDocumentSchema.parse(structuredClone(document));

  for (const op of ops) {
    applySingleOp(next, op);
  }

  if (options.updateTimestamp ?? true) {
    next.updatedAt = new Date().toISOString();
  }

  return DiagramDocumentSchema.parse(next);
}

export function applyProposal(document: DiagramDocument, proposalId: string): DiagramDocument {
  const proposal = document.proposals.find((item) => item.id === proposalId);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  if (proposal.status !== "pending") {
    throw new Error(`Proposal is not pending: ${proposal.status}`);
  }

  const applied = applyPatch(document, proposal.ops);
  return markProposalStatus(applied, proposalId, "accepted");
}

export function rejectProposal(document: DiagramDocument, proposalId: string): DiagramDocument {
  const next = DiagramDocumentSchema.parse(structuredClone(document));
  return markProposalStatus(next, proposalId, "rejected");
}

export function addProposal(
  document: DiagramDocument,
  proposal: Omit<DiagramProposal, "createdAt" | "status"> & {
    createdAt?: string;
    status?: DiagramProposal["status"];
  },
): DiagramDocument {
  const next = DiagramDocumentSchema.parse(structuredClone(document));
  if (next.proposals.some((item) => item.id === proposal.id)) {
    throw new Error(`Proposal already exists: ${proposal.id}`);
  }

  next.proposals.push({
    ...proposal,
    createdAt: proposal.createdAt ?? new Date().toISOString(),
    status: proposal.status ?? "pending",
  });
  next.updatedAt = new Date().toISOString();
  return DiagramDocumentSchema.parse(next);
}

function applySingleOp(document: DiagramDocument, op: DiagramPatchOp): void {
  switch (op.op) {
    case "add_node":
      assertUnique(document.nodes, op.node.id, "node");
      document.nodes.push(op.node);
      if (op.layout) {
        document.layout.nodes[op.node.id] = op.layout;
      }
      break;
    case "update_node":
      Object.assign(findById(document.nodes, op.id, "node"), op.updates);
      break;
    case "delete_node":
      deleteNode(document, op.id);
      break;
    case "move_node": {
      findById(document.nodes, op.id, "node");
      const current = document.layout.nodes[op.id] ?? { width: 190, height: 76, x: 0, y: 0 };
      document.layout.nodes[op.id] = { ...current, x: op.position.x, y: op.position.y, locked: true };
      break;
    }
    case "add_edge":
      assertUnique(document.edges, op.edge.id, "edge");
      assertNodeExists(document, op.edge.from);
      assertNodeExists(document, op.edge.to);
      document.edges.push(op.edge);
      if (op.layout) {
        document.layout.edges[op.edge.id] = op.layout;
      }
      break;
    case "update_edge": {
      const edge = findById(document.edges, op.id, "edge");
      const from = op.updates.from ?? edge.from;
      const to = op.updates.to ?? edge.to;
      assertNodeExists(document, from);
      assertNodeExists(document, to);
      Object.assign(edge, op.updates);
      break;
    }
    case "delete_edge":
      removeById(document.edges, op.id, "edge");
      delete document.layout.edges[op.id];
      break;
    case "add_group":
      assertUnique(document.groups, op.group.id, "group");
      for (const nodeId of op.group.nodeIds) {
        assertNodeExists(document, nodeId);
      }
      document.groups.push(op.group);
      break;
    case "update_group": {
      if (op.updates.nodeIds) {
        for (const nodeId of op.updates.nodeIds) {
          assertNodeExists(document, nodeId);
        }
      }
      Object.assign(findById(document.groups, op.id, "group"), op.updates);
      break;
    }
    case "delete_group": {
      removeById(document.groups, op.id, "group");
      for (const node of document.nodes) {
        if (node.groupId === op.id) {
          delete node.groupId;
        }
      }
      break;
    }
    case "add_note":
      assertUnique(document.notes, op.note.id, "note");
      document.notes.push(op.note);
      break;
    case "update_note":
      Object.assign(findById(document.notes, op.id, "note"), op.updates);
      break;
    case "delete_note":
      removeById(document.notes, op.id, "note");
      break;
    case "add_task":
      assertUnique(document.tasks, op.task.id, "task");
      document.tasks.push(op.task);
      break;
    case "update_task":
      Object.assign(findById(document.tasks, op.id, "task"), op.updates);
      break;
    case "delete_task":
      removeById(document.tasks, op.id, "task");
      break;
    case "add_comment":
      assertUnique(document.comments, op.comment.id, "comment");
      document.comments.push(op.comment);
      break;
    case "resolve_comment":
      findById(document.comments, op.id, "comment").resolved = true;
      break;
    case "set_layout":
      document.layout = op.layout;
      break;
    case "set_direction":
      document.direction = op.direction;
      break;
  }
}

function deleteNode(document: DiagramDocument, nodeId: string): void {
  removeById(document.nodes, nodeId, "node");
  document.edges = document.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  for (const group of document.groups) {
    group.nodeIds = group.nodeIds.filter((id) => id !== nodeId);
  }
  delete document.layout.nodes[nodeId];
  document.layout.edges = Object.fromEntries(
    Object.entries(document.layout.edges).filter(([edgeId]) =>
      document.edges.some((edge) => edge.id === edgeId),
    ),
  );
}

function markProposalStatus(
  document: DiagramDocument,
  proposalId: string,
  status: DiagramProposal["status"],
): DiagramDocument {
  const proposal = document.proposals.find((item) => item.id === proposalId);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  proposal.status = status;
  document.updatedAt = new Date().toISOString();
  return DiagramDocumentSchema.parse(document);
}

function assertNodeExists(document: DiagramDocument, nodeId: string): void {
  findById(document.nodes, nodeId, "node");
}

function assertUnique(items: Array<{ id: string }>, id: string, type: string): void {
  if (items.some((item) => item.id === id)) {
    throw new Error(`${type} already exists: ${id}`);
  }
}

function findById<T extends { id: string }>(items: T[], id: string, type: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`${type} not found: ${id}`);
  }
  return item;
}

function removeById<T extends { id: string }>(items: T[], id: string, type: string): void {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    throw new Error(`${type} not found: ${id}`);
  }
  items.splice(index, 1);
}
