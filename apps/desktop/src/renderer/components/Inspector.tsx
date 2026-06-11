import { MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CodeRef, DiagramDocument, DiagramEdgeArrow } from "@agent-canvas/core";
import { useI18n } from "../i18n";
import { edgeArrows, edgeTypes, nodeTypes, useWorkspaceStore } from "../state/workspace-store";

export function Inspector() {
  const { t } = useI18n();
  const document = useWorkspaceStore((state) => state.document);
  const selection = useWorkspaceStore((state) => state.selection);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const updateEdge = useWorkspaceStore((state) => state.updateEdge);
  const deleteSelected = useWorkspaceStore((state) => state.deleteSelected);
  const addTask = useWorkspaceStore((state) => state.addTask);
  const updateTask = useWorkspaceStore((state) => state.updateTask);
  const addNote = useWorkspaceStore((state) => state.addNote);
  const addComment = useWorkspaceStore((state) => state.addComment);
  const resolveComment = useWorkspaceStore((state) => state.resolveComment);
  const [refPath, setRefPath] = useState("");
  const [refSymbol, setRefSymbol] = useState("");
  const [codeRefError, setCodeRefError] = useState<string | null>(null);
  const [quickText, setQuickText] = useState("");

  if (!document) {
    return null;
  }

  const selectedNode =
    selection?.kind === "node"
      ? document.nodes.find((node) => node.id === selection.id)
      : undefined;
  const selectedEdge =
    selection?.kind === "edge"
      ? document.edges.find((edge) => edge.id === selection.id)
      : undefined;
  const targetId = selectedNode?.id ?? selectedEdge?.id;
  const targetedTasks = document.tasks.filter((task) => task.targetId === targetId);
  const targetedNotes = document.notes.filter((note) => note.targetId === targetId);
  const targetedComments = document.comments.filter((comment) => comment.targetId === targetId);
  const commentThreads = buildCommentThreads(targetedComments);

  return (
    <section className="right-section inspector">
      <div className="right-section-title">
        <strong>{t("inspector.title")}</strong>
        <button title={t("inspector.addServiceNode")} onClick={() => addNode("service")} type="button">
          <Plus size={15} />
        </button>
      </div>

      {!selection ? <p className="muted">{t("inspector.noSelection")}</p> : null}

      {selectedNode ? (
        <div className="field-stack">
          <label>
            {t("inspector.label")}
            <input
              value={selectedNode.label}
              onChange={(event) =>
                updateNode(selectedNode.id, { label: event.target.value || "Untitled" })
              }
            />
          </label>
          <label>
            {t("inspector.type")}
            <select
              value={selectedNode.type}
              onChange={(event) =>
                updateNode(selectedNode.id, {
                  type: event.target.value as typeof selectedNode.type,
                })
              }
            >
              {nodeTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            {t("inspector.description")}
            <textarea
              value={selectedNode.description ?? ""}
              onChange={(event) => updateNode(selectedNode.id, { description: event.target.value })}
            />
          </label>
          <div className="inline-create two">
            <input
              value={refPath}
              onChange={(event) => setRefPath(event.target.value)}
              placeholder={t("inspector.codePath")}
            />
            <input
              value={refSymbol}
              onChange={(event) => setRefSymbol(event.target.value)}
              placeholder={t("inspector.symbol")}
            />
            <button
              title={t("inspector.addCodeRef")}
              onClick={() => {
                const nextPath = refPath.trim();
                if (!nextPath) {
                  return;
                }
                if (isUnsafeCodeRefPath(nextPath)) {
                  setCodeRefError(t("inspector.codeRefUnsafe"));
                  return;
                }
                updateNode(selectedNode.id, {
                  codeRefs: [
                    ...selectedNode.codeRefs,
                    {
                      path: nextPath,
                      ...(refSymbol.trim() ? { symbol: refSymbol.trim() } : {}),
                    },
                  ],
                });
                setRefPath("");
                setRefSymbol("");
                setCodeRefError(null);
              }}
              type="button"
            >
              <Plus size={15} />
            </button>
          </div>
          {codeRefError ? <p className="field-error">{codeRefError}</p> : null}
          {selectedNode.codeRefs.map((ref, index) => (
            <div className="code-ref-row" key={`${ref.path}:${index}`}>
              <code className="list-code">{ref.path}</code>
              <input
                value={ref.symbol ?? ""}
                onChange={(event) => {
                  const symbol = event.target.value.trim();
                  updateNode(selectedNode.id, {
                    codeRefs: selectedNode.codeRefs.map((item, itemIndex) =>
                      itemIndex === index ? withOptionalSymbol(item, symbol) : item,
                    ),
                  });
                }}
                placeholder={t("inspector.symbol")}
              />
              <button
                title={t("inspector.removeCodeRef")}
                onClick={() =>
                  updateNode(selectedNode.id, {
                    codeRefs: selectedNode.codeRefs.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {selectedEdge ? (
        <div className="field-stack">
          <label>
            {t("inspector.label")}
            <input
              value={selectedEdge.label ?? ""}
              onChange={(event) => updateEdge(selectedEdge.id, { label: event.target.value })}
            />
          </label>
          <label>
            {t("inspector.type")}
            <select
              value={selectedEdge.type}
              onChange={(event) =>
                updateEdge(selectedEdge.id, {
                  type: event.target.value as typeof selectedEdge.type,
                })
              }
            >
              {edgeTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            {t("inspector.arrow")}
            <select
              value={selectedEdge.arrow ?? "directed"}
              onChange={(event) =>
                updateEdge(selectedEdge.id, { arrow: event.target.value as DiagramEdgeArrow })
              }
            >
              {edgeArrows.map((arrow) => (
                <option key={arrow.value} value={arrow.value}>
                  {edgeArrowLabel(arrow.value, t)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {selection ? (
        <div className="field-stack">
          <button className="danger-button" onClick={deleteSelected} type="button">
            <Trash2 size={15} />
            {t("inspector.delete")}
          </button>
          <div className="inline-create">
            <input
              value={quickText}
              onChange={(event) => setQuickText(event.target.value)}
              placeholder={t("inspector.taskNoteComment")}
            />
            <button
              title={t("inspector.addComment")}
              onClick={() => {
                addComment(targetId, quickText);
                setQuickText("");
              }}
              type="button"
            >
              <MessageSquarePlus size={15} />
            </button>
            <button
              title={t("inspector.addTask")}
              onClick={() => {
                addTask(targetId, quickText);
                setQuickText("");
              }}
              type="button"
            >
              <Plus size={15} />
            </button>
            <button
              title={t("inspector.addNote")}
              onClick={() => {
                addNote(targetId, quickText);
                setQuickText("");
              }}
              type="button"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="mini-list">
            {targetedTasks.map((task) => (
              <label className="mini-row" key={task.id}>
                <input
                  checked={task.status === "done"}
                  onChange={(event) =>
                    updateTask(task.id, { status: event.target.checked ? "done" : "todo" })
                  }
                  type="checkbox"
                />
                {task.title}
              </label>
            ))}
            {targetedNotes.map((note) => (
              <div className="mini-row" key={note.id}>
                <span>{note.kind}</span>
                {note.text}
              </div>
            ))}
            {commentThreads.map((thread) => (
              <CommentThread
                addComment={addComment}
                key={thread.root.id}
                replies={thread.replies}
                resolveComment={resolveComment}
                root={thread.root}
                targetId={targetId}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface CommentThreadData {
  root: DiagramComment;
  replies: DiagramComment[];
}

type DiagramComment = DiagramDocument["comments"][number];

function CommentThread(props: {
  root: DiagramComment;
  replies: DiagramComment[];
  targetId: string | undefined;
  addComment(targetId: string | undefined, text: string, parentId?: string): void;
  resolveComment(id: string): void;
}) {
  const { t } = useI18n();
  const [replyText, setReplyText] = useState("");
  const authorKind = props.root.authorKind ?? (props.root.author === "agent" ? "agent" : "human");

  return (
    <div className="comment-thread">
      <button className="mini-row" onClick={() => props.resolveComment(props.root.id)} type="button">
        <span>{props.root.resolved ? t("common.resolved") : t("common.open")}</span>
        <strong>{t(authorKind === "agent" ? "comment.agent" : "comment.human")}</strong>
        {props.root.text}
      </button>
      {props.replies.map((reply) => (
        <button className="mini-row reply" key={reply.id} onClick={() => props.resolveComment(reply.id)} type="button">
          <span>{reply.resolved ? t("common.resolved") : t("common.open")}</span>
          <strong>{t((reply.authorKind ?? (reply.author === "agent" ? "agent" : "human")) === "agent" ? "comment.agent" : "comment.human")}</strong>
          {reply.text}
        </button>
      ))}
      <div className="inline-create">
        <input value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder={t("inspector.reply")} />
        <button
          title={t("inspector.reply")}
          onClick={() => {
            props.addComment(props.root.targetId ?? props.targetId, replyText, props.root.id);
            setReplyText("");
          }}
          type="button"
        >
          <MessageSquarePlus size={15} />
        </button>
      </div>
    </div>
  );
}

function buildCommentThreads(comments: DiagramComment[]): CommentThreadData[] {
  const ids = new Set(comments.map((comment) => comment.id));
  const roots = comments.filter((comment) => !comment.parentId || !ids.has(comment.parentId));
  const repliesByParent = new Map<string, DiagramComment[]>();
  for (const comment of comments) {
    if (comment.parentId && ids.has(comment.parentId)) {
      repliesByParent.set(comment.parentId, [...(repliesByParent.get(comment.parentId) ?? []), comment]);
    }
  }
  return roots.map((root) => ({ root, replies: repliesByParent.get(root.id) ?? [] }));
}

function edgeArrowLabel(value: DiagramEdgeArrow, translate: ReturnType<typeof useI18n>["t"]): string {
  switch (value) {
    case "directed":
      return translate("edgeArrow.directed");
    case "bidirectional":
      return translate("edgeArrow.bidirectional");
    case "none":
      return translate("edgeArrow.none");
  }
}

function isUnsafeCodeRefPath(value: string): boolean {
  return (
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value === ".." ||
    value.startsWith("../") ||
    value.startsWith("..\\") ||
    value.includes("/../") ||
    value.includes("\\..\\")
  );
}

function withOptionalSymbol(value: CodeRef, symbol: string): CodeRef {
  if (symbol) {
    return { ...value, symbol };
  }
  const { symbol: _symbol, ...rest } = value;
  return rest;
}
