import type { DiagramDocument } from "../schema/diagram.js";

export interface DiagramDiffSummary {
  addedNodes: string[];
  updatedNodes: string[];
  deletedNodes: string[];
  addedEdges: string[];
  updatedEdges: string[];
  deletedEdges: string[];
  addedTasks: string[];
  deletedTasks: string[];
  addedNotes: string[];
  deletedNotes: string[];
}

export function diffDocuments(before: DiagramDocument, after: DiagramDocument): DiagramDiffSummary {
  return {
    addedNodes: addedIds(before.nodes, after.nodes),
    updatedNodes: updatedIds(before.nodes, after.nodes),
    deletedNodes: deletedIds(before.nodes, after.nodes),
    addedEdges: addedIds(before.edges, after.edges),
    updatedEdges: updatedIds(before.edges, after.edges),
    deletedEdges: deletedIds(before.edges, after.edges),
    addedTasks: addedIds(before.tasks, after.tasks),
    deletedTasks: deletedIds(before.tasks, after.tasks),
    addedNotes: addedIds(before.notes, after.notes),
    deletedNotes: deletedIds(before.notes, after.notes),
  };
}

function addedIds<T extends { id: string }>(before: T[], after: T[]): string[] {
  const beforeIds = new Set(before.map((item) => item.id));
  return after.filter((item) => !beforeIds.has(item.id)).map((item) => item.id);
}

function deletedIds<T extends { id: string }>(before: T[], after: T[]): string[] {
  const afterIds = new Set(after.map((item) => item.id));
  return before.filter((item) => !afterIds.has(item.id)).map((item) => item.id);
}

function updatedIds<T extends { id: string }>(before: T[], after: T[]): string[] {
  const beforeById = new Map(before.map((item) => [item.id, stableStringify(item)]));
  return after
    .filter((item) => beforeById.has(item.id) && beforeById.get(item.id) !== stableStringify(item))
    .map((item) => item.id);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}
