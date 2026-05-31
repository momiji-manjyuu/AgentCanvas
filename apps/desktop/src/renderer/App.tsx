import { useEffect } from "react";
import { CanvasView } from "./components/CanvasView";
import { DriftPanel } from "./components/DriftPanel";
import { Inspector } from "./components/Inspector";
import { MermaidPanel } from "./components/MermaidPanel";
import { ProposalPanel } from "./components/ProposalPanel";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { isAgentCanvasBridgeUnavailable } from "./lib/electron-api";
import { useWorkspaceStore } from "./state/workspace-store";

export default function App() {
  const document = useWorkspaceStore((state) => state.document);
  const toast = useWorkspaceStore((state) => state.toast);
  const dismissToast = useWorkspaceStore((state) => state.dismissToast);
  const busy = useWorkspaceStore((state) => state.busy);
  const lastError = useWorkspaceStore((state) => state.lastError);
  const save = useWorkspaceStore((state) => state.save);
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);
  const deleteSelected = useWorkspaceStore((state) => state.deleteSelected);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
      if (command && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const target = event.target as HTMLElement | null;
        if (!isEditableTarget(target)) {
          deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, redo, save, undo]);

  if (isAgentCanvasBridgeUnavailable()) {
    return (
      <div className="welcome-screen">
        <section className="welcome-panel error-panel">
          <div className="brand-mark">AC</div>
          <h1>Preload/IPC is not initialized</h1>
          <p>The desktop bridge is unavailable, so workspace file operations are disabled.</p>
        </section>
      </div>
    );
  }

  if (!document) {
    return <WelcomeScreen />;
  }

  return (
    <div className="app-shell" aria-busy={busy}>
      <Sidebar />
      <main className="workspace-main">
        <Toolbar />
        <CanvasView />
      </main>
      <aside className="right-rail">
        <Inspector />
        <MermaidPanel />
        <ProposalPanel />
        <DriftPanel />
      </aside>
      {toast ? (
        <button className="toast" onClick={dismissToast} type="button">
          {toast}
        </button>
      ) : null}
      {lastError ? <div className="inline-error">{lastError}</div> : null}
    </div>
  );
}

function isEditableTarget(target: HTMLElement | null): boolean {
  if (!target) {
    return false;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable ||
    Boolean(target.closest("[contenteditable='true']"))
  );
}
