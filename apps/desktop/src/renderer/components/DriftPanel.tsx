import { Radar } from "lucide-react";
import { useWorkspaceStore } from "../state/workspace-store";

export function DriftPanel() {
  const drift = useWorkspaceStore((state) => state.drift);
  const detectDrift = useWorkspaceStore((state) => state.detectDrift);

  return (
    <section className="right-section drift-panel">
      <div className="right-section-title">
        <strong>Drift</strong>
        <button title="Detect drift" onClick={() => void detectDrift()} type="button">
          <Radar size={15} />
        </button>
      </div>
      {!drift ? <p className="muted">No drift scan yet</p> : null}
      {drift ? (
        <>
          <div className="scan-summary">
            <span>{drift.scan.files.length} files</span>
            <span>{drift.scan.symbols.length} symbols</span>
            <span>{drift.issues.length} issues</span>
          </div>
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
