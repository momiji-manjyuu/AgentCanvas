import { FilePlus2, FolderOpen, GitBranch, PlugZap, Waypoints } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { useWorkspaceStore } from "../state/workspace-store";

export function Sidebar() {
  const { locale, setLocale, t } = useI18n();
  const workspaceName = useWorkspaceStore((state) => state.workspaceName);
  const workspacePath = useWorkspaceStore((state) => state.workspacePath);
  const diagrams = useWorkspaceStore((state) => state.diagrams);
  const document = useWorkspaceStore((state) => state.document);
  const gitStatus = useWorkspaceStore((state) => state.gitStatus);
  const mcpSetup = useWorkspaceStore((state) => state.mcpSetup);
  const openWorkspace = useWorkspaceStore((state) => state.openWorkspace);
  const loadDiagram = useWorkspaceStore((state) => state.loadDiagram);
  const createDiagram = useWorkspaceStore((state) => state.createDiagram);
  const loadMcpSetup = useWorkspaceStore((state) => state.loadMcpSetup);
  const [newTitle, setNewTitle] = useState("");
  const saveLocale = (nextLocale: "ja" | "en") => {
    void setLocale(nextLocale).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      useWorkspaceStore.setState({ toast: message, lastError: message });
    });
  };

  useEffect(() => {
    if (workspacePath) {
      void loadMcpSetup();
    }
  }, [loadMcpSetup, workspacePath]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-mark small">AC</div>
        <div>
          <strong>{workspaceName ?? t("sidebar.workspace")}</strong>
          <span>{workspacePath ?? t("sidebar.noFolder")}</span>
        </div>
      </div>

      <button className="sidebar-action" onClick={() => void openWorkspace()} type="button">
        <FolderOpen size={16} />
        {t("sidebar.openFolder")}
      </button>

      <section className="rail-section">
        <div className="section-title">
          <Waypoints size={14} />
          {t("sidebar.diagrams")}
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
              <small>{new Date(diagram.updatedAt).toLocaleString()}</small>
            </button>
          ))}
        </div>
        <div className="inline-create">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={t("sidebar.newDiagram")}
          />
          <button
            title={t("sidebar.createDiagram")}
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
          {t("sidebar.git")}
        </div>
        <div className="git-status">
          {gitStatus?.ok ? (
            gitStatus.status.length ? (
            gitStatus.status.slice(0, 6).map((line) => <code key={line}>{line}</code>)
          ) : (
              <span>{t("common.clean")}</span>
            )
          ) : (
            <span>{gitStatus?.message ?? t("common.notChecked")}</span>
          )}
        </div>
      </section>

      <section className="rail-section">
        <div className="section-title">
          <PlugZap size={14} />
          {t("sidebar.mcp")}
        </div>
        {mcpSetup ? (
          <div className="mcp-actions">
            <button
              onClick={() => void copyMcpText(mcpSetup.claudeCommand, t("sidebar.mcpCopied"))}
              type="button"
            >
              {t("sidebar.mcpCopyCommand")}
            </button>
            <button
              onClick={() => void copyMcpText(mcpSetup.jsonConfig, t("sidebar.mcpCopied"))}
              type="button"
            >
              {t("sidebar.mcpCopyJson")}
            </button>
            <code className="mcp-command">{mcpSetup.serverPath}</code>
          </div>
        ) : (
          <span className="muted">{t("sidebar.mcpUnavailable")}</span>
        )}
      </section>
      <section className="rail-section">
        <div className="section-title">{t("sidebar.language")}</div>
        <div className="language-toggle">
          <button className={locale === "ja" ? "active" : ""} onClick={() => saveLocale("ja")} type="button">
            日本語
          </button>
          <button className={locale === "en" ? "active" : ""} onClick={() => saveLocale("en")} type="button">
            English
          </button>
        </div>
      </section>
    </aside>
  );
}

async function copyMcpText(text: string, toast: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  useWorkspaceStore.setState({ toast, lastError: null });
}
