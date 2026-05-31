import { describe, expect, it } from "vitest";
import { normalizeRecentWorkspaces, rememberRecentWorkspace } from "../src/main/recent-workspaces.js";

describe("recent workspaces", () => {
  it("deduplicates paths and keeps the newest entry first", () => {
    const result = normalizeRecentWorkspaces([
      { path: "C:/work/agent", name: "Old", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
      { path: "C:/work/agent", name: "New", lastOpenedAt: "2026-02-01T00:00:00.000Z" },
      { path: "C:/work/other", name: "Other", lastOpenedAt: "2026-01-15T00:00:00.000Z" },
    ]);

    expect(result.map((workspace) => workspace.name)).toEqual(["New", "Other"]);
  });

  it("limits remembered workspaces", () => {
    const existing = Array.from({ length: 10 }, (_, index) => ({
      path: `C:/work/${index}`,
      name: `${index}`,
      lastOpenedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));

    const result = rememberRecentWorkspace(existing, "C:/work/latest", "2026-02-01T00:00:00.000Z", 4);
    expect(result).toHaveLength(4);
    expect(result[0]?.name).toBe("latest");
  });
});
