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

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button title="Save" onClick={() => void save()} type="button">
          <Save size={16} />
        </button>
        <button
          title="Export Mermaid"
          onClick={() => void copyText(document ? exportMermaid(document) : "", "Mermaid copied")}
          type="button"
        >
          <Waypoints size={16} />
        </button>
        <button
          title="Export Markdown"
          onClick={() => void copyText(document ? exportMarkdown(document) : "", "Markdown copied")}
          type="button"
        >
          <ScrollText size={16} />
        </button>
      </div>
      <div className="toolbar-group">
        <button title="Auto Layout" onClick={() => void autoLayout()} type="button">
          <LayoutGrid size={16} />
        </button>
        <button title="Detect Drift" onClick={() => void detectDrift()} type="button">
          <Waypoints size={16} />
        </button>
        <button title="Create Sample Proposal" onClick={() => void createSampleProposal()} type="button">
          <GitPullRequestCreate size={16} />
        </button>
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-group">
        <button title="Add Node" onClick={() => addNode("service")} type="button">
          <Plus size={16} />
        </button>
        <button title="Undo" onClick={undo} type="button">
          <Undo2 size={16} />
        </button>
        <button title="Redo" onClick={redo} type="button">
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
  await navigator.clipboard.writeText(text);
  useWorkspaceStore.setState({ toast: message });
}
