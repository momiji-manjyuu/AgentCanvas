import { Download, Upload } from "lucide-react";
import { exportMarkdown, exportMermaid } from "@agent-canvas/core";
import { useMemo, useState } from "react";
import { useWorkspaceStore } from "../state/workspace-store";

export function MermaidPanel() {
  const document = useWorkspaceStore((state) => state.document);
  const importMermaid = useWorkspaceStore((state) => state.importMermaid);
  const busy = useWorkspaceStore((state) => state.busy);
  const [title, setTitle] = useState("Imported Diagram");
  const [source, setSource] = useState("flowchart LR\n  client[\"Client\"] --> api[\"API\"]\n");
  const mermaid = useMemo(() => (document ? exportMermaid(document) : ""), [document]);
  const markdown = useMemo(() => (document ? exportMarkdown(document) : ""), [document]);
  const unsupported = document?.metadata.unsupportedMermaidLines;
  const unsupportedLines = Array.isArray(unsupported) ? unsupported.filter((line) => typeof line === "string") : [];

  if (!document) {
    return null;
  }

  return (
    <section className="right-section mermaid-panel">
      <div className="right-section-title">
        <strong>Mermaid</strong>
        <button title="Copy Mermaid" onClick={() => void copyMermaid(mermaid)} disabled={busy} type="button">
          <Download size={15} />
        </button>
      </div>
      <textarea className="code-area" readOnly value={mermaid} />
      <details>
        <summary>Markdown export</summary>
        <textarea className="code-area compact" readOnly value={markdown} />
      </details>
      {unsupportedLines.length ? (
        <div className="warning-block">
          {unsupportedLines.map((line) => (
            <code key={line}>{line}</code>
          ))}
        </div>
      ) : null}
      <div className="import-box">
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
        <textarea value={source} onChange={(event) => setSource(event.target.value)} />
        <button onClick={() => void importMermaid(title, source)} disabled={busy} type="button">
          <Upload size={15} />
          Import
        </button>
      </div>
    </section>
  );
}

async function copyMermaid(mermaid: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(mermaid);
    useWorkspaceStore.setState({ toast: "Mermaid copied", lastError: null });
  } catch {
    useWorkspaceStore.setState({ toast: "Clipboard write failed", lastError: "Clipboard write failed" });
  }
}
