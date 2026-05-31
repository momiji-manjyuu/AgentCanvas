import { MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CodeRef, DiagramEdgeArrow } from "@agent-canvas/core";
import { edgeArrows, edgeTypes, nodeTypes, useWorkspaceStore } from "../state/workspace-store";

export function Inspector() {
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

  return (
    <section className="right-section inspector">
      <div className="right-section-title">
        <strong>Inspector</strong>
        <button title="Add service node" onClick={() => addNode("service")} type="button">
          <Plus size={15} />
        </button>
      </div>

      {!selection ? <p className="muted">No selection</p> : null}

      {selectedNode ? (
        <div className="field-stack">
          <label>
            Label
            <input
              value={selectedNode.label}
              onChange={(event) =>
                updateNode(selectedNode.id, { label: event.target.value || "Untitled" })
              }
            />
          </label>
          <label>
            Type
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
            Description
            <textarea
              value={selectedNode.description ?? ""}
              onChange={(event) => updateNode(selectedNode.id, { description: event.target.value })}
            />
          </label>
          <div className="inline-create two">
            <input
              value={refPath}
              onChange={(event) => setRefPath(event.target.value)}
              placeholder="code path"
            />
            <input
              value={refSymbol}
              onChange={(event) => setRefSymbol(event.target.value)}
              placeholder="symbol"
            />
            <button
              title="Add code reference"
              onClick={() => {
                const nextPath = refPath.trim();
                if (!nextPath) {
                  return;
                }
                if (isUnsafeCodeRefPath(nextPath)) {
                  setCodeRefError("Code references must stay inside the workspace");
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
                placeholder="symbol"
              />
              <button
                title="Remove code reference"
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
            Label
            <input
              value={selectedEdge.label ?? ""}
              onChange={(event) => updateEdge(selectedEdge.id, { label: event.target.value })}
            />
          </label>
          <label>
            Type
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
            Arrow
            <select
              value={selectedEdge.arrow ?? "directed"}
              onChange={(event) =>
                updateEdge(selectedEdge.id, { arrow: event.target.value as DiagramEdgeArrow })
              }
            >
              {edgeArrows.map((arrow) => (
                <option key={arrow.value} value={arrow.value}>
                  {arrow.label}
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
            Delete
          </button>
          <div className="inline-create">
            <input
              value={quickText}
              onChange={(event) => setQuickText(event.target.value)}
              placeholder="Task, note, comment"
            />
            <button
              title="Add comment"
              onClick={() => {
                addComment(targetId, quickText);
                setQuickText("");
              }}
              type="button"
            >
              <MessageSquarePlus size={15} />
            </button>
            <button
              title="Add task"
              onClick={() => {
                addTask(targetId, quickText);
                setQuickText("");
              }}
              type="button"
            >
              <Plus size={15} />
            </button>
            <button
              title="Add note"
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
            {targetedComments.map((comment) => (
              <button
                className="mini-row"
                key={comment.id}
                onClick={() => resolveComment(comment.id)}
                type="button"
              >
                <span>{comment.resolved ? "resolved" : "open"}</span>
                {comment.text}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
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
