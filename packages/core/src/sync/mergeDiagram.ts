import {
  DiagramDocumentSchema,
  type DiagramComment,
  type DiagramDocument,
  type DiagramNote,
  type DiagramProposal,
  type DiagramTask,
} from "../schema/diagram.js";
import { migrateDiagram } from "../schema/migrate.js";

export interface PreservedFromDisk {
  proposals: string[];
  comments: string[];
  tasks: string[];
  notes: string[];
}

export interface MergeExternalChangesResult {
  merged: DiagramDocument;
  preservedFromDisk: PreservedFromDisk;
}

export function mergeExternalChanges(
  diskDoc: DiagramDocument,
  memoryDoc: DiagramDocument,
): MergeExternalChangesResult {
  const disk = migrateDiagram(diskDoc);
  const memory = migrateDiagram(memoryDoc);
  const preservedFromDisk: PreservedFromDisk = {
    proposals: [],
    comments: [],
    tasks: [],
    notes: [],
  };

  const merged = DiagramDocumentSchema.parse({
    ...memory,
    proposals: mergeProposals(disk.proposals, memory.proposals, preservedFromDisk),
    comments: mergeComments(disk.comments, memory.comments, preservedFromDisk),
    tasks: mergeById(disk.tasks, memory.tasks, preservedFromDisk.tasks),
    notes: mergeById(disk.notes, memory.notes, preservedFromDisk.notes),
    updatedAt: new Date().toISOString(),
  });

  return { merged, preservedFromDisk };
}

function mergeProposals(
  disk: DiagramProposal[],
  memory: DiagramProposal[],
  preservedFromDisk: PreservedFromDisk,
): DiagramProposal[] {
  const diskById = new Map(disk.map((item) => [item.id, item]));
  const merged = memory.map((memoryProposal) => {
    const diskProposal = diskById.get(memoryProposal.id);
    if (!diskProposal) {
      return memoryProposal;
    }
    if (memoryProposal.status === "pending" && diskProposal.status !== "pending") {
      preservedFromDisk.proposals.push(diskProposal.id);
      return diskProposal;
    }
    return memoryProposal;
  });

  const memoryIds = new Set(memory.map((item) => item.id));
  for (const diskProposal of disk) {
    if (!memoryIds.has(diskProposal.id)) {
      preservedFromDisk.proposals.push(diskProposal.id);
      merged.push(diskProposal);
    }
  }
  return merged;
}

function mergeComments(
  disk: DiagramComment[],
  memory: DiagramComment[],
  preservedFromDisk: PreservedFromDisk,
): DiagramComment[] {
  const diskById = new Map(disk.map((item) => [item.id, item]));
  const merged = memory.map((memoryComment) => {
    const diskComment = diskById.get(memoryComment.id);
    return diskComment
      ? { ...memoryComment, resolved: memoryComment.resolved || diskComment.resolved }
      : memoryComment;
  });

  const memoryIds = new Set(memory.map((item) => item.id));
  for (const diskComment of disk) {
    if (!memoryIds.has(diskComment.id)) {
      preservedFromDisk.comments.push(diskComment.id);
      merged.push(diskComment);
    }
  }
  return merged;
}

function mergeById<T extends DiagramTask | DiagramNote>(
  disk: T[],
  memory: T[],
  preservedIds: string[],
): T[] {
  const merged = [...memory];
  const memoryIds = new Set(memory.map((item) => item.id));
  for (const diskItem of disk) {
    if (!memoryIds.has(diskItem.id)) {
      preservedIds.push(diskItem.id);
      merged.push(diskItem);
    }
  }
  return merged;
}
