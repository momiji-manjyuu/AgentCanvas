import { useEffect } from "react";
import { CanvasView } from "./components/CanvasView";
import { DriftPanel } from "./components/DriftPanel";
import { Inspector } from "./components/Inspector";
import { MermaidPanel } from "./components/MermaidPanel";
import { ProposalPanel } from "./components/ProposalPanel";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { useWorkspaceStore } from "./state/workspace-store";

export default function App() {
  const document = useWorkspaceStore((state) => state.document);
  const toast = useWorkspaceStore((state) => state.toast);
  const dismissToast = useWorkspaceStore((state) => state.dismissToast);
  const busy = useWorkspaceStore((state) => state.busy);
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
        if (target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA" && target?.tagName !== "SELECT") {
          deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, redo, save, undo]);

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
    </div>
  );
}
