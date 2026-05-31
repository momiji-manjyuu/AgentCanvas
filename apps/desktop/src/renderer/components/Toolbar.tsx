import {
  GitPullRequestCreate,
  LayoutGrid,
  Plus,
  Redo2,
  Save,
  ScrollText,
  Undo2,
  Waypoints,
} from "lucide-react";
import { exportMarkdown, exportMermaid } from "@agent-canvas/core";
import { useWorkspaceStore } from "../state/workspace-store";

export function Toolbar() {
  const document = useWorkspaceStore((state) => state.document);
  const save = useWorkspaceStore((state) => state.save);
  const autoLayout = useWorkspaceStore((state) => state.autoLayout);
  const detectDrift = useWorkspaceStore((state) => state.detectDrift);
  const createSampleProposal = useWorkspaceStore((state) => state.createSampleProposal);
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const busy = useWorkspaceStore((state) => state.busy);
  const dirty = useWorkspaceStore((state) => state.dirty);

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button title="Save" onClick={() => void save()} disabled={busy || !dirty} type="button">
          <Save size={16} />
        </button>
        <button
          title="Export Mermaid"
          onClick={() => void copyText(document ? exportMermaid(document) : "", "Mermaid copied")}
          disabled={busy}
          type="button"
        >
          <Waypoints size={16} />
        </button>
        <button
          title="Export Markdown"
          onClick={() => void copyText(document ? exportMarkdown(document) : "", "Markdown copied")}
          disabled={busy}
          type="button"
        >
          <ScrollText size={16} />
        </button>
      </div>
      <div className="toolbar-group">
        <button title="Auto Layout" onClick={() => void autoLayout()} disabled={busy} type="button">
          <LayoutGrid size={16} />
        </button>
        <button title="Detect Drift" onClick={() => void detectDrift()} disabled={busy} type="button">
          <Waypoints size={16} />
        </button>
        <button title="Create Sample Proposal" onClick={() => void createSampleProposal()} disabled={busy} type="button">
          <GitPullRequestCreate size={16} />
        </button>
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-group">
        <button title="Add Node" onClick={() => addNode("service")} disabled={busy} type="button">
          <Plus size={16} />
        </button>
        <button title="Undo" onClick={undo} disabled={busy} type="button">
          <Undo2 size={16} />
        </button>
        <button title="Redo" onClick={redo} disabled={busy} type="button">
          <Redo2 size={16} />
        </button>
      </div>
    </header>
  );
}

async function copyText(text: string, message: string): Promise<void> {
  if (!text) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    useWorkspaceStore.setState({ toast: message, lastError: null });
  } catch {
    useWorkspaceStore.setState({ toast: "Clipboard write failed", lastError: "Clipboard write failed" });
  }
}
