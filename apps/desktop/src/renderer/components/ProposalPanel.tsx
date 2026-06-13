import { Check, Eye, GitPullRequest, X } from "lucide-react";
import { useState } from "react";
import { describeOp } from "@agent-canvas/core";
import { useI18n } from "../i18n";
import { useWorkspaceStore } from "../state/workspace-store";

export function ProposalPanel() {
  const { t } = useI18n();
  const document = useWorkspaceStore((state) => state.document);
  const activeProposalId = useWorkspaceStore((state) => state.activeProposalId);
  const preview = useWorkspaceStore((state) => state.preview);
  const previewProposal = useWorkspaceStore((state) => state.previewProposal);
  const clearPreview = useWorkspaceStore((state) => state.clearPreview);
  const acceptProposal = useWorkspaceStore((state) => state.acceptProposal);
  const rejectProposal = useWorkspaceStore((state) => state.rejectProposal);
  const busy = useWorkspaceStore((state) => state.busy);
  const [rejectingProposalId, setRejectingProposalId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [selectedOps, setSelectedOps] = useState<Record<string, number[]>>({});

  if (!document) {
    return null;
  }

  const pending = document.proposals.filter((proposal) => proposal.status === "pending");
  const historical = document.proposals.filter((proposal) => proposal.status !== "pending").slice(-3);

  return (
    <section className="right-section proposal-panel">
      <div className="right-section-title">
        <strong>{t("proposal.title")}</strong>
        <GitPullRequest size={15} />
      </div>

      {pending.length === 0 ? <p className="muted">{t("proposal.empty")}</p> : null}

      {pending.map((proposal) => (
        <article className={proposal.id === activeProposalId ? "proposal active" : "proposal"} key={proposal.id}>
          <header>
            <strong>{proposal.title}</strong>
            <span>{t("proposal.ops", { count: proposal.ops.length })}</span>
          </header>
          <p>{proposal.summary}</p>
          {proposal.risks?.length ? (
            <ul>
              {proposal.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          ) : null}
          <div className="op-list selectable">
            {proposal.ops.map((op, index) => {
              const selected = selectedOpIndexes(selectedOps, proposal.id, proposal.ops.length);
              return (
                <label className="op-choice" key={`${proposal.id}.${index}`}>
                  <input
                    checked={selected.includes(index)}
                    onChange={(event) =>
                      setSelectedOps((current) =>
                        toggleOpIndex(current, proposal.id, proposal.ops.length, index, event.target.checked),
                      )
                    }
                    type="checkbox"
                  />
                  <code>{describeOp(op, document)}</code>
                </label>
              );
            })}
          </div>
          <div className="button-row">
            <button
              onClick={() => void previewProposal(proposal.id, selectedOpIndexes(selectedOps, proposal.id, proposal.ops.length))}
              disabled={busy || selectedOpIndexes(selectedOps, proposal.id, proposal.ops.length).length === 0}
              type="button"
            >
              <Eye size={15} />
              {t("op.preview")}
            </button>
            <button
              onClick={() => void acceptProposal(proposal.id, selectedOpIndexes(selectedOps, proposal.id, proposal.ops.length))}
              disabled={
                busy ||
                selectedOpIndexes(selectedOps, proposal.id, proposal.ops.length).length === 0 ||
                (activeProposalId === proposal.id && preview?.validation.ok === false)
              }
              type="button"
            >
              <Check size={15} />
              {t("op.accept")}
            </button>
            <button
              onClick={() => {
                setRejectingProposalId(proposal.id);
                setReviewNote("");
              }}
              disabled={busy}
              type="button"
            >
              <X size={15} />
              {t("op.reject")}
            </button>
          </div>
          {rejectingProposalId === proposal.id ? (
            <div className="reject-form">
              <textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder={t("proposal.reasonPlaceholder")}
              />
              <div className="button-row">
                <button
                  onClick={() => {
                    void rejectProposal(proposal.id, reviewNote.trim());
                    setRejectingProposalId(null);
                    setReviewNote("");
                  }}
                  disabled={busy}
                  type="button"
                >
                  {t("proposal.rejectConfirm")}
                </button>
                <button
                  onClick={() => {
                    setRejectingProposalId(null);
                    setReviewNote("");
                  }}
                  disabled={busy}
                  type="button"
                >
                  {t("proposal.cancelReject")}
                </button>
              </div>
            </div>
          ) : null}
        </article>
      ))}

      {preview?.diff ? (
        <div className="diff-summary">
          <strong>{t("proposal.previewDiff")}</strong>
          <span>{t("proposal.diffNodes", { count: preview.diff.addedNodes.length })}</span>
          <span>{t("proposal.diffChanged", { count: preview.diff.updatedNodes.length })}</span>
          <span>{t("proposal.diffDeleted", { count: preview.diff.deletedNodes.length })}</span>
          <button onClick={clearPreview} type="button">
            {t("op.clear")}
          </button>
        </div>
      ) : null}

      {preview && !preview.validation.ok ? (
        <div className="warning-block">
          <strong>{t("proposal.previewFailed")}</strong>
          {preview.validation.errors.map((error) => (
            <code key={error}>{error}</code>
          ))}
        </div>
      ) : null}

      {historical.length ? (
        <details>
          <summary>{t("proposal.recentDecisions")}</summary>
          {historical.map((proposal) => (
            <div className="decision-row" key={proposal.id}>
              <span>{proposal.status}</span>
              {proposal.title}
              {proposal.appliedOpIndexes ? <code>ops {proposal.appliedOpIndexes.join(", ")}</code> : null}
              {proposal.reviewNote ? <p>{proposal.reviewNote}</p> : null}
            </div>
          ))}
        </details>
      ) : null}
    </section>
  );
}

function selectedOpIndexes(
  selectedOps: Record<string, number[]>,
  proposalId: string,
  opCount: number,
): number[] {
  return selectedOps[proposalId] ?? Array.from({ length: opCount }, (_, index) => index);
}

function toggleOpIndex(
  selectedOps: Record<string, number[]>,
  proposalId: string,
  opCount: number,
  index: number,
  checked: boolean,
): Record<string, number[]> {
  const current = selectedOpIndexes(selectedOps, proposalId, opCount);
  const next = checked
    ? [...new Set([...current, index])].sort((a, b) => a - b)
    : current.filter((item) => item !== index);
  return { ...selectedOps, [proposalId]: next };
}
