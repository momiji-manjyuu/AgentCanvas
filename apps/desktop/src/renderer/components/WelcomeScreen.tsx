import { FolderOpen, PackagePlus, PlusCircle } from "lucide-react";
import { useEffect } from "react";
import { useI18n } from "../i18n";
import { useWorkspaceStore } from "../state/workspace-store";

export function WelcomeScreen() {
  const { t } = useI18n();
  const openWorkspace = useWorkspaceStore((state) => state.openWorkspace);
  const createSampleWorkspace = useWorkspaceStore((state) => state.createSampleWorkspace);
  const createEmptyWorkspace = useWorkspaceStore((state) => state.createEmptyWorkspace);
  const recentWorkspaces = useWorkspaceStore((state) => state.recentWorkspaces);
  const loadRecentWorkspaces = useWorkspaceStore((state) => state.loadRecentWorkspaces);
  const openRecentWorkspace = useWorkspaceStore((state) => state.openRecentWorkspace);
  const busy = useWorkspaceStore((state) => state.busy);
  const toast = useWorkspaceStore((state) => state.toast);

  useEffect(() => {
    void loadRecentWorkspaces();
  }, [loadRecentWorkspaces]);

  return (
    <div className="welcome-screen">
      <section className="welcome-panel">
        <div className="brand-mark">AC</div>
        <h1>AgentCanvas</h1>
        <p>{t("welcome.subtitle")}</p>
        <div className="welcome-actions">
          <button onClick={() => void openWorkspace()} disabled={busy} type="button">
            <FolderOpen size={18} />
            {t("welcome.openFolder")}
          </button>
          <button onClick={() => void createSampleWorkspace()} disabled={busy} type="button">
            <PackagePlus size={18} />
            {t("welcome.createSample")}
          </button>
          <button onClick={() => void createEmptyWorkspace()} disabled={busy} type="button">
            <PlusCircle size={18} />
            {t("welcome.emptyWorkspace")}
          </button>
        </div>
        {recentWorkspaces.length ? (
          <div className="recent-workspaces">
            <strong>{t("welcome.recent")}</strong>
            {recentWorkspaces.map((workspace) => (
              <button
                key={workspace.path}
                onClick={() => void openRecentWorkspace(workspace.path)}
                disabled={busy}
                type="button"
              >
                <span>{workspace.name}</span>
                <code>{workspace.path}</code>
              </button>
            ))}
          </div>
        ) : null}
        {toast ? <p className="welcome-message">{toast}</p> : null}
      </section>
    </div>
  );
}
