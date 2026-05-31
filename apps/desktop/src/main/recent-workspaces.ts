import path from "node:path";

export interface RecentWorkspace {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export const MAX_RECENT_WORKSPACES = 8;

export function normalizeRecentWorkspaces(
  value: unknown,
  maxItems = MAX_RECENT_WORKSPACES,
): RecentWorkspace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const byPath = new Map<string, RecentWorkspace>();
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const candidate = item as Partial<RecentWorkspace>;
    if (typeof candidate.path !== "string" || !candidate.path.trim()) {
      continue;
    }
    const resolved = path.resolve(candidate.path);
    const workspace: RecentWorkspace = {
      path: resolved,
      name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : path.basename(resolved),
      lastOpenedAt:
        typeof candidate.lastOpenedAt === "string" && candidate.lastOpenedAt.trim()
          ? candidate.lastOpenedAt
          : new Date(0).toISOString(),
    };
    const existing = byPath.get(resolved);
    if (!existing || existing.lastOpenedAt < workspace.lastOpenedAt) {
      byPath.set(resolved, workspace);
    }
  }

  return [...byPath.values()]
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .slice(0, maxItems);
}

export function rememberRecentWorkspace(
  existing: RecentWorkspace[],
  workspacePath: string,
  now = new Date().toISOString(),
  maxItems = MAX_RECENT_WORKSPACES,
): RecentWorkspace[] {
  const resolved = path.resolve(workspacePath);
  return normalizeRecentWorkspaces(
    [
      { path: resolved, name: path.basename(resolved), lastOpenedAt: now },
      ...existing.filter((item) => path.resolve(item.path) !== resolved),
    ],
    maxItems,
  );
}
