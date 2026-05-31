import { Check, Eye, GitPullRequest, X } from "lucide-react";
import { useWorkspaceStore } from "../state/workspace-store";

export function ProposalPanel() {
  const document = useWorkspaceStore((state) => state.document);
  const activeProposalId = useWorkspaceStore((state) => state.activeProposalId);
  const preview = useWorkspaceStore((state) => state.preview);
  const previewProposal = useWorkspaceStore((state) => state.previewProposal);
  const clearPreview = useWorkspaceStore((state) => state.clearPreview);
  const acceptProposal = useWorkspaceStore((state) => state.acceptProposal);
  const rejectProposal = useWorkspaceStore((state) => state.rejectProposal);

  if (!document) {
    return null;
  }

  const pending = document.proposals.filter((proposal) => proposal.status === "pending");
  const historical = document.proposals.filter((proposal) => proposal.status !== "pending").slice(-3);

  return (
    <section className="right-section proposal-panel">
      <div className="right-section-title">
        <strong>Proposals</strong>
        <GitPullRequest size={15} />
      </div>

      {pending.length === 0 ? <p className="muted">No pending proposals</p> : null}

      {pending.map((proposal) => (
        <article className={proposal.id === activeProposalId ? "proposal active" : "proposal"} key={proposal.id}>
          <header>
            <strong>{proposal.title}</strong>
            <span>{proposal.ops.length} ops</span>
          </header>
          <p>{proposal.summary}</p>
          {proposal.risks?.length ? (
            <ul>
              {proposal.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          ) : null}
          <div className="op-list">
            {proposal.ops.map((op, index) => (
              <code key={`${proposal.id}.${index}`}>{op.op}</code>
            ))}
          </div>
          <div className="button-row">
            <button onClick={() => void previewProposal(proposal.id)} type="button">
              <Eye size={15} />
              Preview
            </button>
            <button onClick={() => void acceptProposal(proposal.id)} type="button">
              <Check size={15} />
              Accept
            </button>
            <button onClick={() => void rejectProposal(proposal.id)} type="button">
              <X size={15} />
              Reject
            </button>
          </div>
        </article>
      ))}

      {preview?.diff ? (
        <div className="diff-summary">
          <strong>Preview diff</strong>
          <span>+{preview.diff.addedNodes.length} nodes</span>
          <span>{preview.diff.updatedNodes.length} changed</span>
          <span>-{preview.diff.deletedNodes.length} deleted</span>
          <button onClick={clearPreview} type="button">
            Clear
          </button>
        </div>
      ) : null}

      {historical.length ? (
        <details>
          <summary>Recent decisions</summary>
          {historical.map((proposal) => (
            <div className="decision-row" key={proposal.id}>
              <span>{proposal.status}</span>
              {proposal.title}
            </div>
          ))}
        </details>
      ) : null}
    </section>
  );
}
