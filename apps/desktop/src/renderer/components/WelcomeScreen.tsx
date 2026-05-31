import { FolderOpen, PackagePlus, PlusCircle } from "lucide-react";
import { useWorkspaceStore } from "../state/workspace-store";

export function WelcomeScreen() {
  const openWorkspace = useWorkspaceStore((state) => state.openWorkspace);
  const createSampleWorkspace = useWorkspaceStore((state) => state.createSampleWorkspace);
  const createEmptyWorkspace = useWorkspaceStore((state) => state.createEmptyWorkspace);
  const busy = useWorkspaceStore((state) => state.busy);
  const toast = useWorkspaceStore((state) => state.toast);

  return (
    <div className="welcome-screen">
      <section className="welcome-panel">
        <div className="brand-mark">AC</div>
        <h1>AgentCanvas</h1>
        <p>Local-first design canvas for diagrams, tasks, decisions, proposals, and code drift.</p>
        <div className="welcome-actions">
          <button onClick={() => void openWorkspace()} disabled={busy} type="button">
            <FolderOpen size={18} />
            Open Folder
          </button>
          <button onClick={() => void createSampleWorkspace()} disabled={busy} type="button">
            <PackagePlus size={18} />
            Create Sample
          </button>
          <button onClick={() => void createEmptyWorkspace()} disabled={busy} type="button">
            <PlusCircle size={18} />
            Empty Workspace
          </button>
        </div>
        {toast ? <p className="welcome-message">{toast}</p> : null}
      </section>
    </div>
  );
}
