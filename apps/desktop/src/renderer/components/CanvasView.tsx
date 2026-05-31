import {
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  getStraightPath,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnReconnect,
  type ReactFlowInstance,
  useReactFlow,
} from "@xyflow/react";
import clsx from "clsx";
import type {
  DiagramDiffSummary,
  DiagramDocument,
  DiagramEdge,
  DiagramEdgeArrow,
  DiagramNode,
  DiagramNodeType,
} from "@agent-canvas/core";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  edgeArrows,
  nodeTypes as diagramNodeTypes,
  type Selection,
  useWorkspaceStore,
} from "../state/workspace-store";

type DiffState = "added" | "changed" | "deleted" | "normal";
type EdgePathKind = "smoothstep" | "straight" | "bezier";
type EdgeControlPoint = { x: number; y: number };
type FlowNodeRect = { height: number; width: number; x: number; y: number };
type StepSegmentControl = { point: EdgeControlPoint; segmentIndex: number };
type EdgeControlHandle = { key: string; point: EdgeControlPoint; segmentIndex?: number };
type DraftStepControl = { point: EdgeControlPoint; segmentIndex: number };
type EdgeGeometryPatch = {
  bend?: EdgeControlPoint;
  curveControl?: EdgeControlPoint;
  stepBendLevel?: number;
  stepControls?: StepSegmentControl[];
};
type FlowNodeData = { label: ReactNode };
type FlowNode = Node<FlowNodeData, "diagram">;
type FlowEdgeData = Record<string, unknown> & {
  bend?: EdgeControlPoint;
  curveControl?: EdgeControlPoint;
  onCommitGeometry?: (edgeId: string, patch: EdgeGeometryPatch) => void;
  obstacleRects?: FlowNodeRect[];
  pathKind: EdgePathKind;
  sourceNodeRect?: FlowNodeRect;
  stepBendLevel?: number;
  stepControls?: StepSegmentControl[];
  targetNodeRect?: FlowNodeRect;
};
type FlowEdge = Edge<FlowEdgeData, "editable">;
type NodeOrEdgeTarget = { kind: "edge"; id: string } | { kind: "node"; id: string };
type ContextMenuState = {
  target: NodeOrEdgeTarget | { kind: "pane"; position: EdgeControlPoint };
  x: number;
  y: number;
};
type LabelEditorState = { target: NodeOrEdgeTarget; value: string; x: number; y: number };

const connectionHandles: Array<{
  id: string;
  position: Position;
  style: CSSProperties;
}> = [
  { id: "handle-top-left", position: Position.Top, style: { left: "0%", top: "0%" } },
  { id: "handle-top-quarter", position: Position.Top, style: { left: "25%", top: "0%" } },
  { id: "handle-top", position: Position.Top, style: { left: "50%", top: "0%" } },
  { id: "handle-top-three-quarter", position: Position.Top, style: { left: "75%", top: "0%" } },
  { id: "handle-top-right", position: Position.Top, style: { left: "100%", top: "0%" } },
  { id: "handle-right-quarter", position: Position.Right, style: { left: "100%", top: "25%" } },
  { id: "handle-right", position: Position.Right, style: { left: "100%", top: "50%" } },
  {
    id: "handle-right-three-quarter",
    position: Position.Right,
    style: { left: "100%", top: "75%" },
  },
  { id: "handle-bottom-right", position: Position.Bottom, style: { left: "100%", top: "100%" } },
  {
    id: "handle-bottom-three-quarter",
    position: Position.Bottom,
    style: { left: "75%", top: "100%" },
  },
  { id: "handle-bottom", position: Position.Bottom, style: { left: "50%", top: "100%" } },
  { id: "handle-bottom-quarter", position: Position.Bottom, style: { left: "25%", top: "100%" } },
  { id: "handle-bottom-left", position: Position.Bottom, style: { left: "0%", top: "100%" } },
  { id: "handle-left-three-quarter", position: Position.Left, style: { left: "0%", top: "75%" } },
  { id: "handle-left", position: Position.Left, style: { left: "0%", top: "50%" } },
  { id: "handle-left-quarter", position: Position.Left, style: { left: "0%", top: "25%" } },
];

const flowNodeTypes = {
  diagram: DiagramFlowNode,
};

const flowEdgeTypes = {
  editable: EditableEdge,
};

const pathKindLabels: Record<EdgePathKind, string> = {
  smoothstep: "Step",
  straight: "Straight",
  bezier: "Curve",
};

const MAX_STEP_BEND_LEVEL = 3;
const STEP_NODE_AVOIDANCE_PADDING = 12;
const STEP_HANDLE_EXIT_DISTANCE = 30;
const STEP_AUTO_LANE_GAP = 42;

export function CanvasView() {
  const document = useWorkspaceStore((state) => state.document);
  const preview = useWorkspaceStore((state) => state.preview);
  const selection = useWorkspaceStore((state) => state.selection);
  const select = useWorkspaceStore((state) => state.select);
  const moveNode = useWorkspaceStore((state) => state.moveNode);
  const addNode = useWorkspaceStore((state) => state.addNode);
  const addEdge = useWorkspaceStore((state) => state.addEdge);
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const updateEdge = useWorkspaceStore((state) => state.updateEdge);
  const deleteSelection = useWorkspaceStore((state) => state.deleteSelection);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [labelEditor, setLabelEditor] = useState<LabelEditorState | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    FlowNode,
    FlowEdge
  > | null>(null);

  const updateEdgeGeometry = useCallback(
    (edgeId: string, patch: EdgeGeometryPatch) => {
      const edge = document?.edges.find((item) => item.id === edgeId);
      if (!edge) {
        return;
      }
      updateEdge(edgeId, {
        metadata: mergeMetadata(edge.metadata, patch),
      });
    },
    [document, updateEdge],
  );

  const view = useMemo(
    () =>
      buildFlow(document, preview?.previewDocument ?? null, preview?.diff ?? null, {
        onCommitGeometry: updateEdgeGeometry,
        selection,
      }),
    [document, preview, selection, updateEdgeGeometry],
  );
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>(view.nodes);
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>(view.edges);

  useEffect(() => {
    setFlowNodes(view.nodes);
  }, [view.nodes]);

  useEffect(() => {
    setFlowEdges(view.edges);
  }, [view.edges]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setFlowNodes((nodes) => applyNodeChanges(changes, nodes));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    setFlowEdges((edges) => applyEdgeChanges(changes, edges));
  }, []);

  const onReconnect = useCallback<OnReconnect<FlowEdge>>(
    (oldEdge, connection) => {
      const edge = document?.edges.find((item) => item.id === oldEdge.id);
      if (
        !edge ||
        !connection.source ||
        !connection.target ||
        connection.source === connection.target
      ) {
        return;
      }
      updateEdge(oldEdge.id, {
        from: connection.source,
        to: connection.target,
        metadata: mergeMetadata(edge.metadata, {
          sourceHandle: connection.sourceHandle ?? undefined,
          targetHandle: connection.targetHandle ?? undefined,
        }),
      });
      select({ kind: "edge", id: oldEdge.id });
    },
    [document, select, updateEdge],
  );

  if (!document) {
    return null;
  }

  const onConnect = (connection: Connection) => {
    if (connection.source && connection.target) {
      addEdge(connection.source, connection.target, {
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      });
    }
  };

  const addNodeFromPaneMenu = (type: DiagramNodeType) => {
    if (!contextMenu || contextMenu.target.kind !== "pane") {
      return;
    }
    addNode(type, {
      x: contextMenu.target.position.x - 95,
      y: contextMenu.target.position.y - 38,
    });
    setContextMenu(null);
  };

  const openLabelEditor = (target: NodeOrEdgeTarget, x: number, y: number) => {
    if (target.kind === "node") {
      const node = document.nodes.find((item) => item.id === target.id);
      if (node) {
        setLabelEditor({ target, value: node.label, x, y });
      }
    } else {
      const edge = document.edges.find((item) => item.id === target.id);
      if (edge) {
        setLabelEditor({ target, value: edge.label ?? "", x, y });
      }
    }
    setContextMenu(null);
  };

  const commitLabelEditor = () => {
    if (!labelEditor) {
      return;
    }
    const value = labelEditor.value.trim();
    if (labelEditor.target.kind === "node") {
      if (value) {
        updateNode(labelEditor.target.id, { label: value });
      }
    } else {
      updateEdge(labelEditor.target.id, { label: value || undefined });
    }
    setLabelEditor(null);
  };

  const setEdgePathKind = (edgeId: string, pathKind: EdgePathKind) => {
    const edge = document.edges.find((item) => item.id === edgeId);
    if (!edge) {
      return;
    }
    updateEdge(edgeId, {
      metadata: mergeMetadata(edge.metadata, {
        bend: pathKind === "smoothstep" ? edge.metadata.bend : undefined,
        curveControl: pathKind === "bezier" ? edge.metadata.curveControl : undefined,
        stepBendLevel: pathKind === "smoothstep" ? edge.metadata.stepBendLevel : undefined,
        stepControls: pathKind === "smoothstep" ? edge.metadata.stepControls : undefined,
        pathKind,
      }),
    });
    setContextMenu(null);
  };

  const setEdgeArrow = (edgeId: string, arrow: DiagramEdgeArrow) => {
    updateEdge(edgeId, { arrow });
    setContextMenu(null);
  };

  const setStepBendLevel = (edgeId: string, nextLevel: number) => {
    const edge = document.edges.find((item) => item.id === edgeId);
    if (!edge) {
      return;
    }
    const stepBendLevel = clampStepBendLevel(nextLevel);
    updateEdge(edgeId, {
      metadata: mergeMetadata(edge.metadata, {
        pathKind: "smoothstep",
        stepBendLevel: stepBendLevel > 0 ? stepBendLevel : undefined,
        stepControls: undefined,
      }),
    });
  };

  const closeContextMenu = () => setContextMenu(null);
  const contextMenuElement = (() => {
    if (!contextMenu) {
      return null;
    }

    const { target, x, y } = contextMenu;
    const targetEdge =
      target.kind === "edge" ? document.edges.find((item) => item.id === target.id) : null;
    const targetStepBendLevel = targetEdge
      ? metadataStepBendLevel(targetEdge.metadata.stepBendLevel)
      : 0;
    return (
      <div className="canvas-context-menu" style={{ left: x, top: y }}>
        {target.kind === "pane" ? (
          <div className="context-menu-group add-node-group">
            {diagramNodeTypes.map((type) => (
              <button key={type} onClick={() => addNodeFromPaneMenu(type)} type="button">
                Add {type}
              </button>
            ))}
          </div>
        ) : (
          <>
            <button onClick={() => openLabelEditor(target, x, y)} type="button">
              Edit label
            </button>
            {target.kind === "edge" ? (
              <div className="context-menu-group">
                {(Object.keys(pathKindLabels) as EdgePathKind[]).map((kind) => (
                  <button onClick={() => setEdgePathKind(target.id, kind)} type="button" key={kind}>
                    {pathKindLabels[kind]} line
                  </button>
                ))}
              </div>
            ) : null}
            {target.kind === "edge" ? (
              <div className="context-menu-group">
                {edgeArrows.map((arrow) => (
                  <button
                    disabled={targetEdge?.arrow === arrow.value}
                    key={arrow.value}
                    onClick={() => setEdgeArrow(target.id, arrow.value)}
                    type="button"
                  >
                    {arrow.label}
                  </button>
                ))}
              </div>
            ) : null}
            {targetEdge && edgePathKind(targetEdge) === "smoothstep" ? (
              <div className="context-menu-group">
                <button
                  disabled={targetStepBendLevel <= 0}
                  onClick={() => setStepBendLevel(target.id, targetStepBendLevel - 1)}
                  type="button"
                >
                  Fewer step bends
                </button>
                <button
                  disabled={targetStepBendLevel >= MAX_STEP_BEND_LEVEL}
                  onClick={() => setStepBendLevel(target.id, targetStepBendLevel + 1)}
                  type="button"
                >
                  More step bends
                </button>
              </div>
            ) : null}
            <button
              className="danger-menu-item"
              onClick={() => {
                deleteSelection(target);
                setContextMenu(null);
              }}
              type="button"
            >
              Delete
            </button>
          </>
        )}
      </div>
    );
  })();

  return (
    <section className="canvas-shell">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        edgeTypes={flowEdgeTypes}
        nodeTypes={flowNodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        minZoom={0.25}
        maxZoom={1.5}
        onConnect={onConnect}
        onEdgeClick={(_, edge) => {
          select({ kind: "edge", id: edge.id });
          closeContextMenu();
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          event.stopPropagation();
          select({ kind: "edge", id: edge.id });
          setContextMenu({
            target: { kind: "edge", id: edge.id },
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onEdgeDoubleClick={(event, edge) => {
          event.preventDefault();
          openLabelEditor({ kind: "edge", id: edge.id }, event.clientX, event.clientY);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          event.stopPropagation();
          select({ kind: "node", id: node.id });
          setContextMenu({
            target: { kind: "node", id: node.id },
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onNodeDoubleClick={(event, node) => {
          event.preventDefault();
          openLabelEditor({ kind: "node", id: node.id }, event.clientX, event.clientY);
        }}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => moveNode(node.id, node.position.x, node.position.y)}
        onInit={setReactFlowInstance}
        onPaneClick={closeContextMenu}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          if (!reactFlowInstance) {
            return;
          }
          const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          setContextMenu({
            target: { kind: "pane", position },
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onReconnect={onReconnect}
        panOnDrag
        edgesReconnectable
        elevateEdgesOnSelect
        reconnectRadius={8}
        selectionOnDrag={false}
        onSelectionChange={({ nodes, edges }) => {
          const node = nodes[0];
          const edge = edges[0];
          if (node) {
            select({ kind: "node", id: node.id });
          } else if (edge) {
            select({ kind: "edge", id: edge.id });
          } else {
            select(null);
          }
        }}
      >
        <Background color="#d7dce3" gap={22} size={1} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
        <Controls />
      </ReactFlow>
      {contextMenuElement}
      {labelEditor ? (
        <input
          autoFocus
          className="canvas-label-editor"
          onBlur={commitLabelEditor}
          onChange={(event) => setLabelEditor({ ...labelEditor, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitLabelEditor();
            }
            if (event.key === "Escape") {
              setLabelEditor(null);
            }
          }}
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: labelEditor.x, top: labelEditor.y }}
          value={labelEditor.value}
        />
      ) : null}
    </section>
  );
}

function DiagramFlowNode({ data }: NodeProps<FlowNode>) {
  return (
    <>
      {connectionHandles.map((handle) => (
        <Handle
          className="flow-node-handle"
          id={handle.id}
          key={handle.id}
          position={handle.position}
          style={handle.style}
          type="source"
        />
      ))}
      {data.label}
    </>
  );
}

function EditableEdge({
  data,
  id,
  label,
  markerEnd,
  markerStart,
  selected,
  sourcePosition,
  sourceX,
  sourceY,
  style,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps<FlowEdge>) {
  const reactFlow = useReactFlow<FlowNode, FlowEdge>();
  const pathKind = data?.pathKind ?? "smoothstep";
  const [draftPoint, setDraftPoint] = useState<EdgeControlPoint | null>(null);
  const [draftStepControl, setDraftStepControl] = useState<DraftStepControl | null>(null);
  const controlPoint =
    draftPoint ?? edgeControlPoint(pathKind, data, sourceX, sourceY, targetX, targetY);
  const [edgePath, labelX, labelY, controlHandles] = edgePathForKind({
    controlPoint,
    draftStepControl,
    obstacleRects: data?.obstacleRects ?? [],
    pathKind,
    sourceNodeRect: data?.sourceNodeRect,
    sourcePosition,
    sourceX,
    stepBendLevel: data?.stepBendLevel ?? 0,
    stepControls: data?.stepControls ?? [],
    sourceY,
    targetNodeRect: data?.targetNodeRect,
    targetPosition,
    targetX,
    targetY,
  });
  const hasDraggableControls = pathKind === "straight" ? false : controlHandles.length > 0;

  useEffect(() => {
    setDraftPoint(null);
    setDraftStepControl(null);
  }, [data?.bend, data?.curveControl, data?.stepBendLevel, data?.stepControls, pathKind]);

  const startControlDrag = (
    event: MouseEvent<HTMLButtonElement>,
    controlHandle: EdgeControlHandle,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const commitPoint = (clientX: number, clientY: number) =>
      reactFlow.screenToFlowPosition({ x: clientX, y: clientY });

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const point = commitPoint(moveEvent.clientX, moveEvent.clientY);
      if (pathKind === "smoothstep" && controlHandle.segmentIndex !== undefined) {
        setDraftStepControl({ point, segmentIndex: controlHandle.segmentIndex });
      } else {
        setDraftPoint(point);
      }
    };
    const onMouseUp = (upEvent: globalThis.MouseEvent) => {
      const point = commitPoint(upEvent.clientX, upEvent.clientY);
      setDraftPoint(null);
      setDraftStepControl(null);
      if (pathKind === "smoothstep" && controlHandle.segmentIndex !== undefined) {
        data?.onCommitGeometry?.(id, {
          stepControls: upsertStepControl(data?.stepControls ?? [], {
            point,
            segmentIndex: controlHandle.segmentIndex,
          }),
        });
      } else {
        data?.onCommitGeometry?.(id, { curveControl: point });
      }
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp, { once: true });
  };

  return (
    <>
      <BaseEdge
        id={id}
        interactionWidth={24}
        path={edgePath}
        style={style}
        {...(markerEnd ? { markerEnd } : {})}
        {...(markerStart ? { markerStart } : {})}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {hasDraggableControls && selected ? (
        <EdgeLabelRenderer>
          {controlHandles.map((controlHandle) => (
            <button
              aria-label="Move edge segment"
              className={clsx("edge-control-point nodrag nopan", selected && "selected")}
              key={controlHandle.key}
              onMouseDown={(event) => startControlDrag(event, controlHandle)}
              style={{
                transform: `translate(-50%, -50%) translate(${controlHandle.point.x}px, ${controlHandle.point.y}px)`,
              }}
              type="button"
            />
          ))}
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function edgePathForKind({
  controlPoint,
  draftStepControl,
  obstacleRects,
  pathKind,
  sourceNodeRect,
  sourcePosition,
  sourceX,
  stepBendLevel,
  stepControls,
  sourceY,
  targetNodeRect,
  targetPosition,
  targetX,
  targetY,
}: {
  controlPoint: EdgeControlPoint;
  draftStepControl: DraftStepControl | null;
  obstacleRects: FlowNodeRect[];
  pathKind: EdgePathKind;
  sourceNodeRect: FlowNodeRect | undefined;
  sourcePosition: Position;
  sourceX: number;
  stepBendLevel: number;
  stepControls: StepSegmentControl[];
  sourceY: number;
  targetNodeRect: FlowNodeRect | undefined;
  targetPosition: Position;
  targetX: number;
  targetY: number;
}): [string, number, number, EdgeControlHandle[]] {
  if (pathKind === "straight") {
    const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    return [path, labelX, labelY, []];
  }
  if (pathKind === "bezier") {
    const labelPoint = quadraticPoint(
      sourceX,
      sourceY,
      controlPoint.x,
      controlPoint.y,
      targetX,
      targetY,
      0.5,
    );
    return [
      `M ${sourceX},${sourceY} Q ${controlPoint.x},${controlPoint.y} ${targetX},${targetY}`,
      labelPoint.x,
      labelPoint.y,
      [{ key: "curve", point: controlPoint }],
    ];
  }
  const [path, labelX, labelY, controlHandles] = getOrthogonalStepPath({
    controlPoint,
    draftStepControl,
    obstacleRects,
    sourceNodeRect,
    sourcePosition,
    sourceX,
    stepBendLevel,
    stepControls,
    sourceY,
    targetNodeRect,
    targetPosition,
    targetX,
    targetY,
  });
  return [path, labelX, labelY, controlHandles];
}

function getOrthogonalStepPath({
  controlPoint,
  draftStepControl,
  obstacleRects,
  sourceNodeRect,
  sourcePosition,
  sourceX,
  stepBendLevel,
  stepControls,
  sourceY,
  targetNodeRect,
  targetPosition,
  targetX,
  targetY,
}: {
  controlPoint: EdgeControlPoint;
  draftStepControl: DraftStepControl | null;
  obstacleRects: FlowNodeRect[];
  sourceNodeRect: FlowNodeRect | undefined;
  sourcePosition: Position;
  sourceX: number;
  stepBendLevel: number;
  stepControls: StepSegmentControl[];
  sourceY: number;
  targetNodeRect: FlowNodeRect | undefined;
  targetPosition: Position;
  targetX: number;
  targetY: number;
}): [string, number, number, EdgeControlHandle[]] {
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const basePoints = exteriorStepPoints(
    source,
    target,
    sourcePosition,
    targetPosition,
    controlPoint,
  );
  const routedBasePoints = avoidNodeCollisions({
    basePoints,
    controlPoint,
    obstacleRects,
    source,
    sourceNodeRect,
    sourcePosition,
    target,
    targetNodeRect,
    targetPosition,
  });
  const clampedStepBendLevel = clampStepBendLevel(stepBendLevel);
  const generatedPoints = addStepBends(routedBasePoints, controlPoint, clampedStepBendLevel);
  const points = applyStepSegmentControls(
    generatedPoints,
    draftStepControl ? upsertStepControl(stepControls, draftStepControl) : stepControls,
  );
  const controlHandles = stepControlHandles(points);
  const labelPoint = controlHandles[0]?.point ?? pathMidpoint(points);

  return [roundedOrthogonalPath(points, 5), labelPoint.x, labelPoint.y, controlHandles];
}

function exteriorStepPoints(
  source: EdgeControlPoint,
  target: EdgeControlPoint,
  sourcePosition: Position,
  targetPosition: Position,
  controlPoint: EdgeControlPoint,
): EdgeControlPoint[] {
  const directPoints = minimalStepPoints(
    source,
    target,
    sourcePosition,
    targetPosition,
    controlPoint,
  );
  if (
    leavesHandleOutward(source, directPoints[1], sourcePosition) &&
    leavesHandleOutward(target, directPoints.at(-2), targetPosition)
  ) {
    return directPoints;
  }

  const sourceExit = offsetFromHandle(source, sourcePosition, 28);
  const targetExit = offsetFromHandle(target, targetPosition, 28);
  const innerPoints = minimalStepPoints(
    sourceExit,
    targetExit,
    sourcePosition,
    targetPosition,
    controlPoint,
  );
  return compactPoints([source, ...innerPoints, target]);
}

function avoidNodeCollisions({
  basePoints,
  controlPoint,
  obstacleRects,
  source,
  sourceNodeRect,
  sourcePosition,
  target,
  targetNodeRect,
  targetPosition,
}: {
  basePoints: EdgeControlPoint[];
  controlPoint: EdgeControlPoint;
  obstacleRects: FlowNodeRect[];
  source: EdgeControlPoint;
  sourceNodeRect: FlowNodeRect | undefined;
  sourcePosition: Position;
  target: EdgeControlPoint;
  targetNodeRect: FlowNodeRect | undefined;
  targetPosition: Position;
}): EdgeControlPoint[] {
  const collision = stepRouteCollision(basePoints, sourceNodeRect, targetNodeRect, obstacleRects);
  const backtracksNearEndpoint = routeBacktracksNearEndpoint(
    basePoints,
    sourcePosition,
    targetPosition,
  );
  if (!collision.collides && !backtracksNearEndpoint) {
    return basePoints;
  }

  const candidatePoints = autoDetourStepCandidates({
    basePoints,
    collisionRects: collision.rects,
    controlPoint,
    obstacleRects,
    source,
    sourceNodeRect,
    sourcePosition,
    target,
    targetNodeRect,
    targetPosition,
  });
  const scoredCandidate = candidatePoints
    .map((points) => ({
      points,
      score: stepDetourScore({
        basePoints,
        obstacleRects,
        points,
        source,
        sourceNodeRect,
        sourcePosition,
        target,
        targetNodeRect,
        targetPosition,
      }),
    }))
    .sort((a, b) => a.score - b.score)[0];
  return scoredCandidate?.points ?? basePoints;
}

function routeBacktracksNearEndpoint(
  points: EdgeControlPoint[],
  sourcePosition: Position,
  targetPosition: Position,
): boolean {
  const sourceExit = points[1];
  const sourceNext = points[2];
  const targetExit = points.at(-2);
  const targetPrevious = points.at(-3);
  return (
    movesAgainstHandle(sourceExit, sourceNext, sourcePosition) ||
    movesAgainstHandle(targetExit, targetPrevious, targetPosition)
  );
}

function movesAgainstHandle(
  from: EdgeControlPoint | undefined,
  to: EdgeControlPoint | undefined,
  position: Position,
): boolean {
  if (!from || !to) {
    return false;
  }
  switch (position) {
    case Position.Left:
      return to.x > from.x + 0.5;
    case Position.Right:
      return to.x < from.x - 0.5;
    case Position.Top:
      return to.y > from.y + 0.5;
    case Position.Bottom:
      return to.y < from.y - 0.5;
  }
}

function autoDetourStepCandidates({
  basePoints,
  collisionRects,
  controlPoint,
  obstacleRects,
  source,
  sourceNodeRect,
  sourcePosition,
  target,
  targetNodeRect,
  targetPosition,
}: {
  basePoints: EdgeControlPoint[];
  collisionRects: FlowNodeRect[];
  controlPoint: EdgeControlPoint;
  obstacleRects: FlowNodeRect[];
  source: EdgeControlPoint;
  sourceNodeRect: FlowNodeRect | undefined;
  sourcePosition: Position;
  target: EdgeControlPoint;
  targetNodeRect: FlowNodeRect | undefined;
  targetPosition: Position;
}): EdgeControlPoint[][] {
  const allRects = compactRects([sourceNodeRect, targetNodeRect, ...obstacleRects]);
  const localRects =
    collisionRects.length > 0 ? collisionRects : compactRects([sourceNodeRect, targetNodeRect]);
  const sourceExit = offsetFromHandle(source, sourcePosition, STEP_HANDLE_EXIT_DISTANCE);
  const targetExit = offsetFromHandle(target, targetPosition, STEP_HANDLE_EXIT_DISTANCE);
  const useHorizontalLane = isHorizontalPosition(sourcePosition);
  const individualLaneRects = localRects.map((rect) => [rect]);
  const laneSets = [...individualLaneRects, localRects, allRects].filter(
    (rects) => rects.length > 0,
  );
  const candidates: EdgeControlPoint[][] = [];

  for (const rects of laneSets) {
    const lanes = candidateLaneCoordinates(rects, useHorizontalLane ? "y" : "x", controlPoint);
    for (const lane of lanes) {
      const points = useHorizontalLane
        ? compactPoints([
            source,
            sourceExit,
            { x: sourceExit.x, y: lane },
            { x: targetExit.x, y: lane },
            targetExit,
            target,
          ])
        : compactPoints([
            source,
            sourceExit,
            { x: lane, y: sourceExit.y },
            { x: lane, y: targetExit.y },
            targetExit,
            target,
          ]);
      candidates.push(points);
    }
  }

  return uniqueStepRoutes(candidates).sort((a, b) => {
    const aScore = baseRouteDistanceScore(a, basePoints, useHorizontalLane);
    const bScore = baseRouteDistanceScore(b, basePoints, useHorizontalLane);
    return aScore - bScore;
  });
}

function candidateLaneCoordinates(
  rects: FlowNodeRect[],
  axis: "x" | "y",
  controlPoint: EdgeControlPoint,
): number[] {
  const bounds = rectsBounds(rects.map((rect) => expandRect(rect, STEP_NODE_AVOIDANCE_PADDING)));
  if (!bounds) {
    return [];
  }
  const lanes =
    axis === "y"
      ? [bounds.y - STEP_AUTO_LANE_GAP, bounds.y + bounds.height + STEP_AUTO_LANE_GAP]
      : [bounds.x - STEP_AUTO_LANE_GAP, bounds.x + bounds.width + STEP_AUTO_LANE_GAP];
  const desired = axis === "y" ? controlPoint.y : controlPoint.x;
  return [...new Set(lanes.map((lane) => Math.round(lane * 100) / 100))].sort(
    (a, b) => Math.abs(a - desired) - Math.abs(b - desired),
  );
}

function stepDetourScore({
  basePoints,
  obstacleRects,
  points,
  source,
  sourceNodeRect,
  sourcePosition,
  target,
  targetNodeRect,
  targetPosition,
}: {
  basePoints: EdgeControlPoint[];
  obstacleRects: FlowNodeRect[];
  points: EdgeControlPoint[];
  source: EdgeControlPoint;
  sourceNodeRect: FlowNodeRect | undefined;
  sourcePosition: Position;
  target: EdgeControlPoint;
  targetNodeRect: FlowNodeRect | undefined;
  targetPosition: Position;
}): number {
  const useHorizontalLane = isHorizontalPosition(sourcePosition);
  const collision = stepRouteCollision(points, sourceNodeRect, targetNodeRect, obstacleRects);
  const backtrackPenalty = routeBacktracksNearEndpoint(points, sourcePosition, targetPosition)
    ? 50_000
    : 0;
  return (
    collision.rects.length * 100_000 +
    backtrackPenalty +
    (useHorizontalLane
      ? objectOverpassPenalty(points, source, target, [
          ...compactRects([sourceNodeRect, targetNodeRect]),
          ...obstacleRects,
        ])
      : 0) +
    baseRouteDistanceScore(points, basePoints, useHorizontalLane)
  );
}

function baseRouteDistanceScore(
  points: EdgeControlPoint[],
  basePoints: EdgeControlPoint[],
  horizontalLane: boolean,
): number {
  return (
    routeLength(points) +
    Math.abs(
      orthogonalRouteMidpoint(points, horizontalLane) -
        orthogonalRouteMidpoint(basePoints, horizontalLane),
    ) *
      0.15
  );
}

function objectOverpassPenalty(
  points: EdgeControlPoint[],
  source: EdgeControlPoint,
  target: EdgeControlPoint,
  rects: FlowNodeRect[],
): number {
  if (points.length < 4) {
    return 0;
  }
  const routeBounds = rectsBounds(rects);
  if (!routeBounds) {
    return 0;
  }
  const midpoint = pathMidpoint(points);
  const routeAboveEndpoints = midpoint.y < Math.min(source.y, target.y) - 1;
  const routeAboveAllObjects = midpoint.y < routeBounds.y - STEP_AUTO_LANE_GAP / 2;
  return routeAboveEndpoints || routeAboveAllObjects ? 2_500 : 0;
}

function stepRouteCollision(
  points: EdgeControlPoint[],
  sourceNodeRect: FlowNodeRect | undefined,
  targetNodeRect: FlowNodeRect | undefined,
  obstacleRects: FlowNodeRect[],
): { collides: boolean; rects: FlowNodeRect[] } {
  const collisionRects: FlowNodeRect[] = [];
  const rects = [
    ...(sourceNodeRect ? [{ rect: sourceNodeRect, role: "source" as const }] : []),
    ...(targetNodeRect ? [{ rect: targetNodeRect, role: "target" as const }] : []),
    ...obstacleRects.map((rect) => ({ rect, role: "obstacle" as const })),
  ];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    for (const { rect, role } of rects) {
      if (
        (role === "source" && index === 0) ||
        (role === "target" && index === points.length - 2)
      ) {
        continue;
      }
      if (segmentIntersectsRect(start, end, expandRect(rect, STEP_NODE_AVOIDANCE_PADDING))) {
        collisionRects.push(rect);
      }
    }
  }

  return { collides: collisionRects.length > 0, rects: compactRects(collisionRects) };
}

function segmentIntersectsRect(
  start: EdgeControlPoint,
  end: EdgeControlPoint,
  rect: FlowNodeRect,
): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  if (nearlyEqual(start.x, end.x)) {
    const x = start.x;
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return x >= left && x <= right && maxY >= top && minY <= bottom;
  }

  if (nearlyEqual(start.y, end.y)) {
    const y = start.y;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return y >= top && y <= bottom && maxX >= left && minX <= right;
  }

  return false;
}

function applyStepSegmentControls(
  points: EdgeControlPoint[],
  controls: StepSegmentControl[],
): EdgeControlPoint[] {
  const next = points.map((point) => ({ ...point }));
  const lastSegmentIndex = next.length - 2;

  for (const control of controls) {
    if (control.segmentIndex <= 0 || control.segmentIndex >= lastSegmentIndex) {
      continue;
    }
    const start = next[control.segmentIndex];
    const end = next[control.segmentIndex + 1];
    if (!start || !end) {
      continue;
    }
    if (nearlyEqual(start.y, end.y)) {
      start.y = control.point.y;
      end.y = control.point.y;
    } else if (nearlyEqual(start.x, end.x)) {
      start.x = control.point.x;
      end.x = control.point.x;
    }
  }

  return compactPoints(next);
}

function stepControlHandles(points: EdgeControlPoint[]): EdgeControlHandle[] {
  const cornerIndexes = orthogonalCornerIndexes(points);
  if (cornerIndexes.length <= 1) {
    return [];
  }

  const movableSegments = stepMovableSegments(points);
  if (cornerIndexes.length === 2) {
    const middleSegmentIndex = cornerIndexes[0]!;
    const segment =
      movableSegments.find((item) => item.segmentIndex === middleSegmentIndex) ??
      movableSegments.at(Math.floor(movableSegments.length / 2));
    return segment ? [segment] : [];
  }

  return movableSegments;
}

function stepMovableSegments(points: EdgeControlPoint[]): EdgeControlHandle[] {
  const handles: EdgeControlHandle[] = [];
  for (let segmentIndex = 1; segmentIndex < points.length - 2; segmentIndex += 1) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    if (!start || !end || distance(start, end) < 14) {
      continue;
    }
    if (!nearlyEqual(start.x, end.x) && !nearlyEqual(start.y, end.y)) {
      continue;
    }
    handles.push({
      key: `step-segment-${segmentIndex}`,
      point: segmentMidpoint(start, end),
      segmentIndex,
    });
  }
  return handles;
}

function orthogonalCornerIndexes(points: EdgeControlPoint[]): number[] {
  const indexes: number[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const next = points[index + 1]!;
    if (
      !(
        (nearlyEqual(previous.x, point.x) && nearlyEqual(point.x, next.x)) ||
        (nearlyEqual(previous.y, point.y) && nearlyEqual(point.y, next.y))
      )
    ) {
      indexes.push(index);
    }
  }
  return indexes;
}

function minimalStepPoints(
  source: EdgeControlPoint,
  target: EdgeControlPoint,
  sourcePosition: Position,
  targetPosition: Position,
  controlPoint: EdgeControlPoint,
): EdgeControlPoint[] {
  const sourceHorizontal = isHorizontalPosition(sourcePosition);
  const targetHorizontal = isHorizontalPosition(targetPosition);

  if (sourceHorizontal && targetHorizontal) {
    if (nearlyEqual(source.y, target.y)) {
      return [source, target];
    }
    const splitX = Number.isFinite(controlPoint.x) ? controlPoint.x : (source.x + target.x) / 2;
    return compactPoints([source, { x: splitX, y: source.y }, { x: splitX, y: target.y }, target]);
  }

  if (!sourceHorizontal && !targetHorizontal) {
    if (nearlyEqual(source.x, target.x)) {
      return [source, target];
    }
    const splitY = Number.isFinite(controlPoint.y) ? controlPoint.y : (source.y + target.y) / 2;
    return compactPoints([source, { x: source.x, y: splitY }, { x: target.x, y: splitY }, target]);
  }

  const corner = sourceHorizontal ? { x: target.x, y: source.y } : { x: source.x, y: target.y };
  return compactPoints([source, corner, target]);
}

function addStepBends(
  points: EdgeControlPoint[],
  controlPoint: EdgeControlPoint,
  stepBendLevel: number,
): EdgeControlPoint[] {
  let next = points;
  for (let index = 0; index < stepBendLevel; index += 1) {
    next = addStepDetour(
      next,
      stepControlSegmentIndex(next, controlPoint, index),
      controlPoint,
      index,
    );
  }
  return compactPoints(next);
}

function addStepDetour(
  points: EdgeControlPoint[],
  segmentIndex: number,
  controlPoint: EdgeControlPoint,
  level: number,
): EdgeControlPoint[] {
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  if (!start || !end || distance(start, end) < 8) {
    return points;
  }

  const firstT = 0.32;
  const secondT = 0.68;
  let replacement: EdgeControlPoint[];
  if (nearlyEqual(start.y, end.y)) {
    const firstX = lerp(start.x, end.x, firstT);
    const secondX = lerp(start.x, end.x, secondT);
    const laneY = detourCoordinate(controlPoint.y, start.y, level);
    replacement = [
      start,
      { x: firstX, y: start.y },
      { x: firstX, y: laneY },
      { x: secondX, y: laneY },
      { x: secondX, y: end.y },
      end,
    ];
  } else if (nearlyEqual(start.x, end.x)) {
    const firstY = lerp(start.y, end.y, firstT);
    const secondY = lerp(start.y, end.y, secondT);
    const laneX = detourCoordinate(controlPoint.x, start.x, level);
    replacement = [
      start,
      { x: start.x, y: firstY },
      { x: laneX, y: firstY },
      { x: laneX, y: secondY },
      { x: end.x, y: secondY },
      end,
    ];
  } else {
    return points;
  }

  return compactPoints([
    ...points.slice(0, segmentIndex),
    ...replacement,
    ...points.slice(segmentIndex + 2),
  ]);
}

function stepControlSegmentIndex(
  points: EdgeControlPoint[],
  controlPoint: EdgeControlPoint,
  stepBendLevel: number,
): number {
  if (points.length < 3) {
    return 0;
  }
  if (stepBendLevel === 0 && points.length === 4) {
    return 1;
  }
  if (stepBendLevel === 0 && points.length === 3) {
    return longestSegmentIndex(points);
  }

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const startIndex = points.length > 3 ? 1 : 0;
  const endIndex = points.length > 3 ? points.length - 3 : points.length - 2;
  for (let index = startIndex; index <= endIndex; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) {
      continue;
    }
    const midpoint = segmentMidpoint(start, end);
    const midpointDistance = distance(midpoint, controlPoint);
    if (midpointDistance < bestDistance) {
      bestDistance = midpointDistance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function longestSegmentIndex(points: EdgeControlPoint[]): number {
  let bestIndex = 0;
  let bestDistance = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentDistance = distance(points[index]!, points[index + 1]!);
    if (segmentDistance > bestDistance) {
      bestDistance = segmentDistance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function routeLength(points: EdgeControlPoint[]): number {
  return points.reduce((sum, point, index) => {
    const previous = points[index - 1];
    return previous ? sum + distance(previous, point) : sum;
  }, 0);
}

function orthogonalRouteMidpoint(points: EdgeControlPoint[], horizontalLane: boolean): number {
  const midpoint = pathMidpoint(points);
  return horizontalLane ? midpoint.y : midpoint.x;
}

function isHorizontalPosition(position: Position): boolean {
  return position === Position.Left || position === Position.Right;
}

function offsetFromHandle(
  point: EdgeControlPoint,
  position: Position,
  offset: number,
): EdgeControlPoint {
  switch (position) {
    case Position.Left:
      return { x: point.x - offset, y: point.y };
    case Position.Right:
      return { x: point.x + offset, y: point.y };
    case Position.Top:
      return { x: point.x, y: point.y - offset };
    case Position.Bottom:
      return { x: point.x, y: point.y + offset };
  }
}

function leavesHandleOutward(
  point: EdgeControlPoint,
  next: EdgeControlPoint | undefined,
  position: Position,
): boolean {
  if (!next) {
    return true;
  }
  switch (position) {
    case Position.Left:
      return next.x <= point.x || nearlyEqual(next.x, point.x);
    case Position.Right:
      return next.x >= point.x || nearlyEqual(next.x, point.x);
    case Position.Top:
      return next.y <= point.y || nearlyEqual(next.y, point.y);
    case Position.Bottom:
      return next.y >= point.y || nearlyEqual(next.y, point.y);
  }
}

function expandRect(rect: FlowNodeRect, padding: number): FlowNodeRect {
  return {
    height: rect.height + padding * 2,
    width: rect.width + padding * 2,
    x: rect.x - padding,
    y: rect.y - padding,
  };
}

function rectsBounds(rects: FlowNodeRect[]): FlowNodeRect | null {
  if (rects.length === 0) {
    return null;
  }
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { height: bottom - top, width: right - left, x: left, y: top };
}

function compactRects(rects: Array<FlowNodeRect | undefined>): FlowNodeRect[] {
  const seen = new Set<string>();
  return rects.flatMap((rect) => {
    if (!rect) {
      return [];
    }
    const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [rect];
  });
}

function uniqueStepRoutes(routes: EdgeControlPoint[][]): EdgeControlPoint[][] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = route.map((point) => `${point.x},${point.y}`).join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function detourCoordinate(desired: number, base: number, level: number): number {
  if (Number.isFinite(desired) && Math.abs(desired - base) >= 18) {
    return desired;
  }
  const direction = desired > base ? 1 : desired < base ? -1 : level % 2 === 0 ? 1 : -1;
  return base + direction * (34 + level * 22);
}

function segmentMidpoint(start: EdgeControlPoint, end: EdgeControlPoint): EdgeControlPoint {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

function pathMidpoint(points: EdgeControlPoint[]): EdgeControlPoint {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  if (points.length === 1) {
    return points[0]!;
  }

  const totalLength = points.reduce((sum, point, index) => {
    const previous = points[index - 1];
    return previous ? sum + distance(previous, point) : sum;
  }, 0);
  let walkedLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const segmentLength = distance(start, end);
    if (walkedLength + segmentLength >= totalLength / 2) {
      const amount = segmentLength === 0 ? 0 : (totalLength / 2 - walkedLength) / segmentLength;
      return { x: lerp(start.x, end.x, amount), y: lerp(start.y, end.y, amount) };
    }
    walkedLength += segmentLength;
  }
  return points.at(-1)!;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

function compactPoints(points: EdgeControlPoint[]): EdgeControlPoint[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
}

function roundedOrthogonalPath(points: EdgeControlPoint[], borderRadius: number): string {
  if (points.length < 2) {
    return "";
  }

  const source = points[0]!;
  let path = `M${source.x} ${source.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    path += orthogonalBend(points[index - 1]!, points[index]!, points[index + 1]!, borderRadius);
  }
  const target = points[points.length - 1]!;
  return `${path}L${target.x} ${target.y}`;
}

function orthogonalBend(
  previous: EdgeControlPoint,
  point: EdgeControlPoint,
  next: EdgeControlPoint,
  radius: number,
): string {
  const bendSize = Math.min(distance(previous, point) / 2, distance(point, next) / 2, radius);
  if (
    (previous.x === point.x && point.x === next.x) ||
    (previous.y === point.y && point.y === next.y)
  ) {
    return `L${point.x} ${point.y}`;
  }
  if (previous.y === point.y) {
    const xDirection = previous.x < next.x ? -1 : 1;
    const yDirection = previous.y < next.y ? 1 : -1;
    return `L ${point.x + bendSize * xDirection},${point.y}Q ${point.x},${point.y} ${point.x},${
      point.y + bendSize * yDirection
    }`;
  }
  const xDirection = previous.x < next.x ? 1 : -1;
  const yDirection = previous.y < next.y ? -1 : 1;
  return `L ${point.x},${point.y + bendSize * yDirection}Q ${point.x},${point.y} ${
    point.x + bendSize * xDirection
  },${point.y}`;
}

function distance(a: EdgeControlPoint, b: EdgeControlPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function edgeControlPoint(
  pathKind: EdgePathKind,
  data: FlowEdgeData | undefined,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): EdgeControlPoint {
  if (pathKind === "bezier") {
    return data?.curveControl ?? defaultCurveControl(sourceX, sourceY, targetX, targetY);
  }
  return data?.bend ?? { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
}

function upsertStepControl(
  controls: StepSegmentControl[],
  nextControl: StepSegmentControl,
): StepSegmentControl[] {
  if (!Number.isInteger(nextControl.segmentIndex) || nextControl.segmentIndex < 0) {
    return controls;
  }
  return [
    ...controls.filter((control) => control.segmentIndex !== nextControl.segmentIndex),
    nextControl,
  ].sort((a, b) => a.segmentIndex - b.segmentIndex);
}

function defaultCurveControl(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): EdgeControlPoint {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: (sourceX + targetX) / 2 - (dy / length) * 56,
    y: (sourceY + targetY) / 2 + (dx / length) * 56,
  };
}

function quadraticPoint(
  sourceX: number,
  sourceY: number,
  controlX: number,
  controlY: number,
  targetX: number,
  targetY: number,
  t: number,
): EdgeControlPoint {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * sourceX + 2 * inverse * t * controlX + t * t * targetX,
    y: inverse * inverse * sourceY + 2 * inverse * t * controlY + t * t * targetY,
  };
}

function buildFlow(
  base: DiagramDocument | null,
  preview: DiagramDocument | null,
  diff: DiagramDiffSummary | null,
  options: {
    onCommitGeometry: (edgeId: string, patch: EdgeGeometryPatch) => void;
    selection: Selection | null;
  },
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (!base) {
    return { nodes: [], edges: [] };
  }

  const display = preview ?? base;
  const deletedNodeIds = new Set(diff?.deletedNodes ?? []);
  const deletedEdgeIds = new Set(diff?.deletedEdges ?? []);
  const nodes = [
    ...display.nodes,
    ...base.nodes.filter(
      (node) => deletedNodeIds.has(node.id) && !display.nodes.some((item) => item.id === node.id),
    ),
  ];
  const edges = [
    ...display.edges,
    ...base.edges.filter(
      (edge) => deletedEdgeIds.has(edge.id) && !display.edges.some((item) => item.id === edge.id),
    ),
  ];
  const layoutByNodeId = new Map(
    nodes.map((node, index) => [
      node.id,
      (preview ?? base).layout.nodes[node.id] ??
        base.layout.nodes[node.id] ?? {
          x: 120 + index * 40,
          y: 120 + index * 20,
          width: 190,
          height: 76,
        },
    ]),
  );

  return {
    nodes: nodes.map((node, index) => {
      const layout = layoutByNodeId.get(node.id) ?? {
        x: 120 + index * 40,
        y: 120 + index * 20,
        width: 190,
        height: 76,
      };
      const diffState = nodeDiffState(node.id, diff);
      return {
        id: node.id,
        type: "diagram",
        position: { x: layout.x, y: layout.y },
        draggable: diffState !== "deleted",
        data: {
          label: <NodeLabel document={base} node={node} diffState={diffState} />,
        },
        style: nodeStyle(node, diffState),
        selected: options.selection?.kind === "node" && options.selection.id === node.id,
        className: clsx("flow-node", `node-${node.type}`, `diff-${diffState}`),
      };
    }),
    edges: edges.map((edge) => {
      const diffState = edgeDiffState(edge.id, diff);
      const handles = edgeHandlePair(edge, display);
      const sourceNodeRect = layoutByNodeId.get(edge.from);
      const targetNodeRect = layoutByNodeId.get(edge.to);
      const data: FlowEdgeData = {
        obstacleRects: [...layoutByNodeId.entries()]
          .filter(([nodeId]) => nodeId !== edge.from && nodeId !== edge.to)
          .map(([, layout]) => layout),
        onCommitGeometry: options.onCommitGeometry,
        pathKind: edgePathKind(edge),
      };
      if (sourceNodeRect) {
        data.sourceNodeRect = sourceNodeRect;
      }
      if (targetNodeRect) {
        data.targetNodeRect = targetNodeRect;
      }
      const bend = metadataPoint(edge.metadata.bend);
      const curveControl = metadataPoint(edge.metadata.curveControl);
      const stepBendLevel = metadataStepBendLevel(edge.metadata.stepBendLevel);
      const stepControls = metadataStepControls(edge.metadata.stepControls);
      if (bend) {
        data.bend = bend;
      }
      if (curveControl) {
        data.curveControl = curveControl;
      }
      if (stepBendLevel > 0) {
        data.stepBendLevel = stepBendLevel;
      }
      if (stepControls.length > 0) {
        data.stepControls = stepControls;
      }
      return {
        id: edge.id,
        data,
        source: edge.from,
        target: edge.to,
        ...handles,
        type: "editable",
        animated: edge.type === "async" || diffState === "added",
        ...edgeMarkers(edge),
        style: edgeStyle(edge, diffState),
        labelStyle: { fill: "#334155", fontSize: 12, fontWeight: 650 },
        selected: options.selection?.kind === "edge" && options.selection.id === edge.id,
        reconnectable: diffState !== "deleted",
        className: edgeEndpointClassNames(handles),
        ...(edge.label ? { label: edge.label } : {}),
      };
    }),
  };
}

function edgeHandlePair(
  edge: DiagramEdge,
  display: DiagramDocument,
): Pick<FlowEdge, "sourceHandle" | "targetHandle"> {
  const sourceHandle = metadataHandle(edge.metadata.sourceHandle);
  const targetHandle = metadataHandle(edge.metadata.targetHandle);
  if (sourceHandle && targetHandle) {
    return { sourceHandle, targetHandle };
  }

  switch (display.direction) {
    case "RL":
      return { sourceHandle: "handle-left", targetHandle: "handle-right" };
    case "TD":
    case "TB":
      return { sourceHandle: "handle-bottom", targetHandle: "handle-top" };
    case "BT":
      return { sourceHandle: "handle-top", targetHandle: "handle-bottom" };
    case "LR":
      return { sourceHandle: "handle-right", targetHandle: "handle-left" };
  }
}

function edgePathKind(edge: DiagramEdge): EdgePathKind {
  const value = edge.metadata.pathKind;
  return value === "straight" || value === "bezier" || value === "smoothstep"
    ? value
    : "smoothstep";
}

function edgeMarkers(edge: DiagramEdge): Pick<FlowEdge, "markerStart" | "markerEnd"> {
  const arrowMarker = { type: MarkerType.ArrowClosed };
  if (edge.arrow === "none") {
    return {};
  }
  if (edge.arrow === "bidirectional") {
    return { markerStart: arrowMarker, markerEnd: arrowMarker };
  }
  return { markerEnd: arrowMarker };
}

function metadataHandle(value: unknown): string | undefined {
  return typeof value === "string" && connectionHandles.some((handle) => handle.id === value)
    ? value
    : undefined;
}

function edgeEndpointClassNames({
  sourceHandle,
  targetHandle,
}: Pick<FlowEdge, "sourceHandle" | "targetHandle">): string {
  return clsx(endpointClassName("source", sourceHandle), endpointClassName("target", targetHandle));
}

function endpointClassName(
  endpoint: "source" | "target",
  handleId: string | null | undefined,
): string {
  const position = connectionHandles.find((handle) => handle.id === handleId)?.position;
  return position ? `edge-${endpoint}-${position}` : "";
}

function metadataPoint(value: unknown): EdgeControlPoint | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  ) {
    return { x: value.x, y: value.y };
  }
  return undefined;
}

function metadataStepControls(value: unknown): StepSegmentControl[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      "segmentIndex" in item &&
      typeof item.segmentIndex === "number" &&
      Number.isInteger(item.segmentIndex) &&
      item.segmentIndex >= 0 &&
      "point" in item
    ) {
      const point = metadataPoint(item.point);
      return point ? [{ point, segmentIndex: item.segmentIndex }] : [];
    }
    return [];
  });
}

function metadataStepBendLevel(value: unknown): number {
  return typeof value === "number" ? clampStepBendLevel(value) : 0;
}

function clampStepBendLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_STEP_BEND_LEVEL, Math.round(value)));
}

function mergeMetadata(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

function NodeLabel({
  document,
  node,
  diffState,
}: {
  document: DiagramDocument;
  node: DiagramNode;
  diffState: DiffState;
}) {
  const taskCount = document.tasks.filter(
    (task) => task.targetId === node.id && task.status !== "done",
  ).length;
  const commentCount = document.comments.filter(
    (comment) => comment.targetId === node.id && !comment.resolved,
  ).length;

  return (
    <div className="node-label">
      <div className="node-title">{node.label}</div>
      <div className="node-meta">
        <span>{node.type}</span>
        {node.codeRefs.length ? <span>{node.codeRefs.length} refs</span> : null}
        {taskCount ? <span>{taskCount} tasks</span> : null}
        {commentCount ? <span>{commentCount} comments</span> : null}
        {diffState !== "normal" ? <strong>{diffState}</strong> : null}
      </div>
    </div>
  );
}

function nodeDiffState(id: string, diff: DiagramDiffSummary | null): DiffState {
  if (diff?.addedNodes.includes(id)) {
    return "added";
  }
  if (diff?.updatedNodes.includes(id)) {
    return "changed";
  }
  if (diff?.deletedNodes.includes(id)) {
    return "deleted";
  }
  return "normal";
}

function edgeDiffState(id: string, diff: DiagramDiffSummary | null): DiffState {
  if (diff?.addedEdges.includes(id)) {
    return "added";
  }
  if (diff?.updatedEdges.includes(id)) {
    return "changed";
  }
  if (diff?.deletedEdges.includes(id)) {
    return "deleted";
  }
  return "normal";
}

function nodeStyle(node: DiagramNode, diffState: DiffState): CSSProperties {
  const palette: Record<DiagramNode["type"], { border: string; background: string }> = {
    actor: { border: "#7c3aed", background: "#faf5ff" },
    service: { border: "#2563eb", background: "#eff6ff" },
    component: { border: "#475569", background: "#f8fafc" },
    database: { border: "#0f766e", background: "#ecfdf5" },
    cache: { border: "#ca8a04", background: "#fffbeb" },
    queue: { border: "#c2410c", background: "#fff7ed" },
    external: { border: "#64748b", background: "#f8fafc" },
    unknown: { border: "#94a3b8", background: "#f8fafc" },
  };
  const diffBorder: Record<DiffState, string | null> = {
    added: "#16a34a",
    changed: "#2563eb",
    deleted: "#dc2626",
    normal: null,
  };
  const colors = palette[node.type];
  return {
    width: 190,
    minHeight: 76,
    padding: 0,
    borderRadius: 8,
    border: `2px ${node.type === "external" ? "dashed" : "solid"} ${diffBorder[diffState] ?? colors.border}`,
    background: diffState === "deleted" ? "#fff1f2" : colors.background,
    opacity: diffState === "deleted" ? 0.55 : 1,
    color: "#111827",
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
  };
}

function edgeStyle(edge: DiagramEdge, diffState: DiffState): CSSProperties {
  const color =
    diffState === "added"
      ? "#16a34a"
      : diffState === "changed"
        ? "#2563eb"
        : diffState === "deleted"
          ? "#dc2626"
          : edge.type === "async"
            ? "#f97316"
            : "#64748b";
  return {
    stroke: color,
    strokeWidth: diffState === "normal" ? 2 : 3,
    opacity: diffState === "deleted" ? 0.45 : 1,
  };
}
