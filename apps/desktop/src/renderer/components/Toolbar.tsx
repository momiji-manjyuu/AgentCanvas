import {
  GitPullRequestCreate,
  FileCode2,
  ImageDown,
  LayoutGrid,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  ScrollText,
  Undo2,
  Waypoints,
} from "lucide-react";
import { exportMarkdown, exportMermaid } from "@agent-canvas/core";
import { toPng } from "html-to-image";
import { t as translate, useI18n } from "../i18n";
import { getAgentCanvasApi } from "../lib/electron-api";
import { exportDiagramHtml } from "../lib/export-html";
import { useWorkspaceStore } from "../state/workspace-store";

export function Toolbar() {
  const { t } = useI18n();
  const document = useWorkspaceStore((state) => state.document);
  const save = useWorkspaceStore((state) => state.save);
  const reloadDiagram = useWorkspaceStore((state) => state.reloadDiagram);
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
        <button title={t("toolbar.save")} onClick={() => void save()} disabled={busy || !dirty} type="button">
          <Save size={16} />
        </button>
        <button title={t("toolbar.reload")} onClick={() => void reloadDiagram()} disabled={busy || !document} type="button">
          <RefreshCw size={16} />
        </button>
        <button
          title={t("toolbar.exportMermaid")}
          onClick={() => void copyText(document ? exportMermaid(document) : "", t("toast.mermaidCopied"))}
          disabled={busy}
          type="button"
        >
          <Waypoints size={16} />
        </button>
        <button
          title={t("toolbar.exportMarkdown")}
          onClick={() => void copyText(document ? exportMarkdown(document) : "", t("toast.markdownCopied"))}
          disabled={busy}
          type="button"
        >
          <ScrollText size={16} />
        </button>
        <button
          title={t("toolbar.exportPng")}
          onClick={() => void exportPng()}
          disabled={busy || !document}
          type="button"
        >
          <ImageDown size={16} />
        </button>
        <button
          title={t("toolbar.exportHtml")}
          onClick={() => void exportHtml()}
          disabled={busy || !document}
          type="button"
        >
          <FileCode2 size={16} />
        </button>
      </div>
      <div className="toolbar-group">
        <button title={t("toolbar.autoLayout")} onClick={() => void autoLayout()} disabled={busy} type="button">
          <LayoutGrid size={16} />
        </button>
        <button title={t("toolbar.detectDrift")} onClick={() => void detectDrift()} disabled={busy} type="button">
          <Waypoints size={16} />
        </button>
        <button title={t("toolbar.createSampleProposal")} onClick={() => void createSampleProposal()} disabled={busy} type="button">
          <GitPullRequestCreate size={16} />
        </button>
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-group">
        <button title={t("toolbar.addNode")} onClick={() => addNode("service")} disabled={busy} type="button">
          <Plus size={16} />
        </button>
        <button title={t("toolbar.undo")} onClick={undo} disabled={busy} type="button">
          <Undo2 size={16} />
        </button>
        <button title={t("toolbar.redo")} onClick={redo} disabled={busy} type="button">
          <Redo2 size={16} />
        </button>
      </div>
    </header>
  );
}

async function exportPng(): Promise<void> {
  const document = useWorkspaceStore.getState().document;
  if (!document) {
    return;
  }
  const pngDataUrl = await capturePngDataUrl();
  if (!pngDataUrl) {
    return;
  }
  const result = await getAgentCanvasApi().exportFile({
    defaultFileName: `${slugify(document.title)}.png`,
    content: dataUrlBase64(pngDataUrl),
    encoding: "base64",
    filters: [{ name: "PNG", extensions: ["png"] }],
  });
  if (result.ok) {
    useWorkspaceStore.setState({ toast: translate("toast.exportedPng"), lastError: null });
  }
}

async function exportHtml(): Promise<void> {
  const document = useWorkspaceStore.getState().document;
  if (!document) {
    return;
  }
  const pngDataUrl = await capturePngDataUrl();
  if (!pngDataUrl) {
    return;
  }
  const result = await getAgentCanvasApi().exportFile({
    defaultFileName: `${slugify(document.title)}.html`,
    content: exportDiagramHtml(document, pngDataUrl),
    encoding: "utf8",
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (result.ok) {
    useWorkspaceStore.setState({ toast: translate("toast.exportedHtml"), lastError: null });
  }
}

async function capturePngDataUrl(): Promise<string | null> {
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) {
    useWorkspaceStore.setState({
      toast: translate("toast.exportMissingViewport"),
      lastError: translate("toast.exportMissingViewport"),
    });
    return null;
  }
  return toPng(viewport, { cacheBust: true, pixelRatio: 2, backgroundColor: "#ffffff" });
}

function dataUrlBase64(dataUrl: string): string {
  return dataUrl.split(",")[1] ?? "";
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "diagram"
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
    useWorkspaceStore.setState({ toast: translate("clipboard.failed"), lastError: translate("clipboard.failed") });
  }
}
