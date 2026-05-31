import { FilePlus2, FolderOpen, GitBranch, PlugZap, Waypoints } from "lucide-react";
import { useState } from "react";
import { useWorkspaceStore } from "../state/workspace-store";

export function Sidebar() {
  const workspaceName = useWorkspaceStore((state) => state.workspaceName);
  const workspacePath = useWorkspaceStore((state) => state.workspacePath);
  const diagrams = useWorkspaceStore((state) => state.diagrams);
  const document = useWorkspaceStore((state) => state.document);
  const gitStatus = useWorkspaceStore((state) => state.gitStatus);
  const openWorkspace = useWorkspaceStore((state) => state.openWorkspace);
  const loadDiagram = useWorkspaceStore((state) => state.loadDiagram);
  const createDiagram = useWorkspaceStore((state) => state.createDiagram);
  const [newTitle, setNewTitle] = useState("");

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-mark small">AC</div>
        <div>
          <strong>{workspaceName ?? "Workspace"}</strong>
          <span>{workspacePath ?? "No folder"}</span>
        </div>
      </div>

      <button className="sidebar-action" onClick={() => void openWorkspace()} type="button">
        <FolderOpen size={16} />
        Open Folder
      </button>

      <section className="rail-section">
        <div className="section-title">
          <Waypoints size={14} />
          Diagrams
        </div>
        <div className="diagram-list">
          {diagrams.map((diagram) => (
            <button
              className={diagram.id === document?.id ? "diagram-row active" : "diagram-row"}
              key={diagram.id}
              onClick={() => void loadDiagram(diagram.id)}
              type="button"
            >
              <span>{diagram.title}</span>
              <small>{new Date(diagram.updatedAt).toLocaleDateString()}</small>
            </button>
          ))}
        </div>
        <div className="inline-create">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="New diagram"
          />
          <button
            title="Create diagram"
            onClick={() => {
              if (newTitle.trim()) {
                void createDiagram(newTitle.trim());
                setNewTitle("");
              }
            }}
            type="button"
          >
            <FilePlus2 size={16} />
          </button>
        </div>
      </section>

      <section className="rail-section">
        <div className="section-title">
          <GitBranch size={14} />
          Git
        </div>
        <div className="git-status">
          {gitStatus?.ok ? (
            gitStatus.status.length ? (
              gitStatus.status.slice(0, 6).map((line) => <code key={line}>{line}</code>)
            ) : (
              <span>Clean</span>
            )
          ) : (
            <span>{gitStatus?.message ?? "Not checked"}</span>
          )}
        </div>
      </section>

      <section className="rail-section">
        <div className="section-title">
          <PlugZap size={14} />
          MCP
        </div>
        <code className="mcp-command">pnpm mcp -- --workspace "{workspacePath ?? "/path/to/workspace"}"</code>
      </section>
    </aside>
  );
}
