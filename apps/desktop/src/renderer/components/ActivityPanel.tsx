import { Activity } from "lucide-react";
import { useI18n } from "../i18n";
import { useWorkspaceStore, type ActivityItem } from "../state/workspace-store";

export function ActivityPanel() {
  const { t } = useI18n();
  const activity = useWorkspaceStore((state) => state.activity);
  const activateProposal = useWorkspaceStore((state) => state.activateProposal);

  return (
    <section className="right-section activity-panel">
      <div className="right-section-title">
        <strong>{t("activity.title")}</strong>
        <Activity size={15} />
      </div>
      {activity.length === 0 ? <p className="muted">{t("activity.empty")}</p> : null}
      <div className="activity-list">
        {activity.map((item) => {
          const proposalId = item.proposalId;
          return proposalId ? (
            <button
              className={`activity-row ${activityClass(item)}`}
              key={item.id}
              onClick={() => activateProposal(proposalId)}
              type="button"
            >
              <span>{formatActivityTime(item.at)}</span>
              <strong>{activityKindLabel(item, t)}</strong>
              <p>{item.message}</p>
            </button>
          ) : (
            <div className={`activity-row ${activityClass(item)}`} key={item.id}>
              <span>{formatActivityTime(item.at)}</span>
              <strong>{activityKindLabel(item, t)}</strong>
              <p>{item.message}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function activityClass(item: ActivityItem): string {
  return `activity-${item.kind}`;
}

function formatActivityTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function activityKindLabel(item: ActivityItem, translate: ReturnType<typeof useI18n>["t"]): string {
  switch (item.kind) {
    case "comment":
      return translate("activity.kind.comment");
    case "decision":
      return translate("activity.kind.decision");
    case "diagram":
      return translate("activity.kind.diagram");
    case "proposal":
      return translate("activity.kind.proposal");
    case "save":
      return translate("activity.kind.save");
    case "warning":
      return translate("activity.kind.warning");
  }
}
