import { Radar } from "lucide-react";
import { useI18n } from "../i18n";
import { useWorkspaceStore } from "../state/workspace-store";

export function DriftPanel() {
  const { t } = useI18n();
  const drift = useWorkspaceStore((state) => state.drift);
  const detectDrift = useWorkspaceStore((state) => state.detectDrift);
  const busy = useWorkspaceStore((state) => state.busy);

  return (
    <section className="right-section drift-panel">
      <div className="right-section-title">
        <strong>{t("drift.title")}</strong>
        <button title={t("drift.detect")} onClick={() => void detectDrift()} disabled={busy} type="button">
          <Radar size={15} />
        </button>
      </div>
      {!drift ? <p className="muted">{t("drift.empty")}</p> : null}
      {drift ? (
        <>
          <div className="scan-summary">
            <span>{t("drift.files", { count: drift.scan.files.length })}</span>
            <span>{t("drift.symbols", { count: drift.scan.symbols.length })}</span>
            <span>{t("drift.issues", { count: drift.issues.length })}</span>
            <span>{t("drift.warnings", { count: drift.scan.warnings.length })}</span>
          </div>
          {drift.scan.warnings.length ? (
            <div className="warning-block">
              {drift.scan.warnings.map((warning) => (
                <code key={`${warning.type}:${warning.path ?? ""}`}>{warning.message}</code>
              ))}
            </div>
          ) : null}
          <div className="drift-list">
            {drift.issues.map((issue) => (
              <div className={`drift-row severity-${issue.severity}`} key={`${issue.type}:${issue.path}:${issue.symbol ?? ""}`}>
                <span>{issue.type}</span>
                <p>{issue.message}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
