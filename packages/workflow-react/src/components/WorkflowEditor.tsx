import { useCallback, useEffect, useMemo, useState } from "react";
import type { Connection } from "reactflow";
import {
  applyPatch,
  type DomainPatch,
  type EditorViewport,
  type Workflow,
  type WorkflowEditorDocument,
  type WorkflowUiMeta,
} from "@cyoda/workflow-core";
import type { LayoutOptions, PinnedNode } from "@cyoda/workflow-layout";
import { I18nContext, mergeMessages, type PartialMessages } from "../i18n/context.js";
import { useEditorStore } from "../state/store.js";
import { deriveFromDocument } from "../state/derive.js";
import type { EditorMode, Selection } from "../state/types.js";
import { Canvas } from "./Canvas.js";
import { resolveConnection, type PendingConnect } from "./resolveConnection.js";
import { Inspector } from "../inspector/Inspector.js";
import { Toolbar } from "../toolbar/Toolbar.js";
import { WorkflowTabs } from "../toolbar/WorkflowTabs.js";
import { DeleteStateModal } from "../modals/DeleteStateModal.js";
import { DragConnectModal } from "../modals/DragConnectModal.js";
import { AddStateModal } from "../modals/AddStateModal.js";
import { CommentNode } from "./CommentNode.js";

/** Controls which chrome elements the editor shell renders. All fields default to `true`. */
export interface ChromeOptions {
  /** Top toolbar (undo/redo/validation pills/save). Default: true. */
  toolbar?: boolean;
  /** Workflow tabs bar. Default: true (also gated by existing single-workflow-viewer rule). */
  tabs?: boolean;
  /** Right-side inspector panel. Default: true. */
  inspector?: boolean;
  /** Canvas minimap. Default: true. */
  minimap?: boolean;
  /** Canvas zoom/pan controls. Default: true. */
  controls?: boolean;
}

export interface WorkflowEditorProps {
  document: WorkflowEditorDocument;
  mode?: EditorMode;
  messages?: PartialMessages;
  layoutOptions?: LayoutOptions;
  /** Selectively suppress editor chrome for compact embed scenarios. */
  chrome?: ChromeOptions;
  onChange?: (doc: WorkflowEditorDocument) => void;
  onSave?: (doc: WorkflowEditorDocument) => void;
  /**
   * Host-controlled layout/UI metadata. When provided it takes precedence over
   * the editor's internal localStorage persistence.
   */
  layoutMetadata?: WorkflowUiMeta;
  /** Called whenever layout positions or other editor-only metadata change. */
  onLayoutMetadataChange?: (meta: WorkflowUiMeta) => void;
  /**
   * localStorage key prefix for layout persistence. Defaults to
   * "cyoda-editor-layout". Pass `null` to disable localStorage persistence.
   */
  localStorageKey?: string | null;
}

interface PendingDelete {
  workflow: string;
  stateCode: string;
}

function defaultNewWorkflow(existing: string[]): Workflow {
  let n = existing.length + 1;
  while (existing.includes(`workflow${n}`)) n++;
  return {
    version: "1.0",
    name: `workflow${n}`,
    initialState: "start",
    active: true,
    states: { start: { transitions: [] } },
  };
}

/** Top-level editor shell — spec §14. Provides viewer/playground/editor modes. */
export function WorkflowEditor({
  document: initialDocument,
  mode = "editor",
  messages,
  layoutOptions,
  chrome,
  onChange,
  onSave,
  layoutMetadata: externalLayoutMeta,
  onLayoutMetadataChange,
  localStorageKey = "cyoda-editor-layout",
}: WorkflowEditorProps) {
  const mergedMessages = useMemo(() => mergeMessages(messages), [messages]);

  // Merge localStorage layout into the initial document on first render only.
  const initialDocumentWithLayout = useMemo(() => {
    if (localStorageKey === null) return initialDocument;
    try {
      const stored = localStorage.getItem(localStorageKey);
      if (!stored) return initialDocument;
      const parsed = JSON.parse(stored) as Record<string, WorkflowUiMeta>;
      const merged: Record<string, WorkflowUiMeta> = { ...initialDocument.meta.workflowUi };
      for (const [wfName, ui] of Object.entries(parsed)) {
        merged[wfName] = { ...(merged[wfName] ?? {}), layout: ui.layout, comments: ui.comments };
      }
      return {
        ...initialDocument,
        meta: { ...initialDocument.meta, workflowUi: merged },
      };
    } catch {
      return initialDocument;
    }
    // Intentionally runs once on mount only — localStorage merge is a one-time init.
  }, []);

  const [state, actions] = useEditorStore(initialDocumentWithLayout, mode);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingConnect, setPendingConnect] = useState<PendingConnect | null>(null);
  const [pendingAddState, setPendingAddState] = useState(false);
  const [layoutKey, setLayoutKey] = useState(0);

  useEffect(() => {
    onChange?.(state.document);
  }, [state.document, onChange]);

  // Persist layout/comments to localStorage whenever workflowUi changes.
  useEffect(() => {
    if (localStorageKey === null) return;
    try {
      const toStore: Record<string, WorkflowUiMeta> = {};
      for (const [wfName, ui] of Object.entries(state.document.meta.workflowUi)) {
        if (ui.layout || ui.comments) {
          toStore[wfName] = { layout: ui.layout, comments: ui.comments };
        }
      }
      if (Object.keys(toStore).length > 0) {
        localStorage.setItem(localStorageKey, JSON.stringify(toStore));
      } else {
        localStorage.removeItem(localStorageKey);
      }
    } catch {
      // Ignore storage quota or SSR errors.
    }
  }, [state.document.meta.workflowUi, localStorageKey]);

  // Notify host of layout changes.
  useEffect(() => {
    if (!onLayoutMetadataChange || !state.activeWorkflow) return;
    const ui = state.document.meta.workflowUi[state.activeWorkflow];
    if (ui) onLayoutMetadataChange(ui);
  }, [state.document.meta.workflowUi, state.activeWorkflow, onLayoutMetadataChange]);

  const readOnly = state.mode === "viewer";
  const derived = useMemo(
    () => deriveFromDocument(state.document),
    [state.document.session, state.document.meta.ids],
  );

  const dispatch = (patch: DomainPatch) => actions.dispatch(patch);

  const handleNodeDragStop = useCallback(
    (nodeId: string, x: number, y: number) => {
      const ptr = state.document.meta.ids.states[nodeId];
      if (!ptr) return;
      actions.dispatch({
        op: "setNodePosition",
        workflow: ptr.workflow,
        stateCode: ptr.state,
        x,
        y,
        pinned: true,
      });
    },
    [state.document.meta.ids.states, actions],
  );

  const handleResetLayout = useCallback(() => {
    const workflow = state.activeWorkflow;
    if (!workflow) return;
    // Use silentReplace so reset is not on the undo stack.
    const workflowUi = { ...state.document.meta.workflowUi };
    const current = workflowUi[workflow] ?? {};
    workflowUi[workflow] = { ...current, layout: undefined };
    actions.silentReplace(
      { session: state.document.session, meta: { ...state.document.meta, workflowUi } },
      { preserveEditorState: true },
    );
  }, [state.activeWorkflow, state.document, actions]);

  const handleAutoLayout = useCallback(() => {
    // Bump layoutKey to force Canvas to re-run ELK while keeping pinned positions.
    setLayoutKey((k) => k + 1);
  }, []);

  const handleAddComment = useCallback(() => {
    const workflow = state.activeWorkflow;
    if (!workflow) return;
    const id = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    actions.dispatch({
      op: "addComment",
      workflow,
      comment: { id, text: "New comment", x: 40, y: 40 },
    });
  }, [state.activeWorkflow, actions]);

  // Build pinned nodes from workflowUi layout metadata for the active workflow.
  const pinnedNodes = useMemo((): PinnedNode[] | undefined => {
    const workflow = state.activeWorkflow;
    if (!workflow) return undefined;
    // Use external metadata if provided, otherwise use internal store.
    const layoutNodes =
      externalLayoutMeta?.layout?.nodes ??
      state.document.meta.workflowUi[workflow]?.layout?.nodes;
    if (!layoutNodes) return undefined;
    const codeToUuid = new Map<string, string>();
    for (const [uuid, ptr] of Object.entries(state.document.meta.ids.states)) {
      if (ptr.workflow === workflow) codeToUuid.set(ptr.state, uuid);
    }
    return Object.entries(layoutNodes)
      .map(([stateCode, pos]) => {
        const id = codeToUuid.get(stateCode);
        return id ? { id, x: pos.x, y: pos.y } : null;
      })
      .filter((p): p is PinnedNode => p !== null);
  }, [
    state.activeWorkflow,
    state.document.meta.ids.states,
    state.document.meta.workflowUi,
    externalLayoutMeta,
  ]);

  const requestDeleteState = (workflow: string, stateCode: string) => {
    setPendingDelete({ workflow, stateCode });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    dispatch({
      op: "removeState",
      workflow: pendingDelete.workflow,
      stateCode: pendingDelete.stateCode,
    });
    setPendingDelete(null);
  };

  const handleConnect = (connection: Connection) => {
    const resolved = resolveConnection(state.document, connection);
    if (resolved) setPendingConnect(resolved);
  };

  const confirmConnect = useCallback(
    (name: string) => {
      if (!pendingConnect) return;
      // We apply addTransition first to learn the minted UUID, then build the
      // exact removeTransition inverse for a clean single-step undo.
      const addPatch: DomainPatch = {
        op: "addTransition",
        workflow: pendingConnect.workflow,
        fromState: pendingConnect.fromState,
        transition: { name, next: pendingConnect.toState, manual: false, disabled: false },
      };
      const priorUUIDs = new Set(Object.keys(state.document.meta.ids.transitions));
      const afterApply = applyPatch(state.document, addPatch);
      const newUUID = Object.keys(afterApply.meta.ids.transitions).find(
        (u) => !priorUUIDs.has(u),
      );
      actions.dispatchTransaction({
        summary: `Add transition "${name}"`,
        patches: [addPatch],
        inverses: newUUID
          ? [{ op: "removeTransition", transitionUuid: newUUID }]
          : [{ op: "replaceSession", session: structuredClone(state.document.session) }],
        selectionAfter: newUUID ? { kind: "transition", transitionUuid: newUUID } : null,
      });
      setPendingConnect(null);
    },
    [pendingConnect, state.document, actions],
  );

  const workflows = state.document.session.workflows;
  const showTabs = workflows.length > 1 || state.mode !== "viewer";

  const confirmAddState = useCallback(
    (name: string) => {
      const workflow = state.activeWorkflow;
      setPendingAddState(false);
      if (!workflow) return;
      actions.dispatchTransaction({
        summary: `Add state "${name}"`,
        patches: [{ op: "addState", workflow, stateCode: name }],
        inverses: [{ op: "removeState", workflow, stateCode: name }],
        selectionAfter: { kind: "state", workflow, stateCode: name, nodeId: "" },
      });
    },
    [state.activeWorkflow, actions],
  );

  const anyModalOpen = pendingDelete !== null || pendingConnect !== null || pendingAddState;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (anyModalOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        if (!readOnly && state.undoStack.length > 0) {
          e.preventDefault();
          actions.undo();
        }
        return;
      }
      if (mod && ((e.key === "z" && e.shiftKey) || e.key === "y" || e.key === "Y")) {
        if (!readOnly && state.redoStack.length > 0) {
          e.preventDefault();
          actions.redo();
        }
        return;
      }
      if (mod && (e.key === "s" || e.key === "S")) {
        if (onSave && !readOnly && derived.errorCount === 0) {
          e.preventDefault();
          onSave(state.document);
        }
        return;
      }
      if (!readOnly && !mod && e.key === "l") {
        e.preventDefault();
        handleAutoLayout();
        return;
      }
      if (!readOnly && !mod && e.key === "L") {
        e.preventDefault();
        handleResetLayout();
        return;
      }
      if (!readOnly && !mod && e.key === "a") {
        e.preventDefault();
        setPendingAddState(true);
        return;
      }
    },
    [
      anyModalOpen,
      readOnly,
      state.undoStack.length,
      state.redoStack.length,
      state.document,
      actions,
      onSave,
      derived.errorCount,
      handleAutoLayout,
      handleResetLayout,
    ],
  );

  const pendingConnectState = useMemo(() => {
    if (!pendingConnect) return null;
    const wf = state.document.session.workflows.find(
      (w) => w.name === pendingConnect.workflow,
    );
    if (!wf) return null;
    return wf.states[pendingConnect.fromState] ?? null;
  }, [pendingConnect, state.document]);

  const orientation = layoutOptions?.orientation ?? "vertical";
  // Merge pinned positions from editor metadata into layout options.
  const effectiveLayoutOptions = useMemo<LayoutOptions>(
    () => ({ ...layoutOptions, pinned: pinnedNodes }),
    [layoutOptions, pinnedNodes],
  );
  const savedViewport =
    state.activeWorkflow
      ? state.document.meta.workflowUi[state.activeWorkflow]?.viewports?.[orientation]
      : undefined;

  const handleViewportChange = useCallback(
    (viewport: EditorViewport) => {
      const workflow = state.activeWorkflow;
      if (!workflow) return;
      const current = state.document.meta.workflowUi[workflow] ?? {};
      const existing = current.viewports?.[orientation];
      const nextViewport = normalizeViewport(viewport);
      if (existing && sameViewport(existing, nextViewport)) return;

      actions.silentReplace(
        {
          session: state.document.session,
          meta: {
            ...state.document.meta,
            workflowUi: {
              ...state.document.meta.workflowUi,
              [workflow]: {
                ...current,
                viewports: {
                  ...(current.viewports ?? {}),
                  [orientation]: nextViewport,
                },
              },
            },
          },
        },
        { preserveEditorState: true },
      );
    },
    [actions, orientation, state.activeWorkflow, state.document],
  );

  return (
    <I18nContext.Provider value={mergedMessages}>
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif',
          outline: "none",
        }}
        data-testid="workflow-editor"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {chrome?.toolbar !== false && (
          <Toolbar
            derived={derived}
            canUndo={state.undoStack.length > 0}
            canRedo={state.redoStack.length > 0}
            readOnly={readOnly}
            onUndo={actions.undo}
            onRedo={actions.redo}
            onSave={onSave ? () => onSave(state.document) : undefined}
            onAddState={!readOnly ? () => setPendingAddState(true) : undefined}
            onAddComment={!readOnly ? handleAddComment : undefined}
            onResetLayout={!readOnly ? handleResetLayout : undefined}
            onAutoLayout={!readOnly ? handleAutoLayout : undefined}
          />
        )}
        {chrome?.tabs !== false && showTabs && (
          <WorkflowTabs
            workflows={workflows}
            activeWorkflow={state.activeWorkflow}
            readOnly={readOnly}
            onSelect={actions.setActiveWorkflow}
            onAdd={() =>
              dispatch({
                op: "addWorkflow",
                workflow: defaultNewWorkflow(workflows.map((w) => w.name)),
              })
            }
            onClose={(name) => dispatch({ op: "removeWorkflow", workflow: name })}
          />
        )}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            <Canvas
              graph={derived.graph}
              issues={derived.issues}
              activeWorkflow={state.activeWorkflow}
              selection={state.selection}
              layoutOptions={effectiveLayoutOptions}
              savedViewport={savedViewport}
              onSelectionChange={(sel: Selection) => actions.setSelection(sel)}
              onViewportChange={handleViewportChange}
              onConnect={handleConnect}
              onNodeDragStop={!readOnly ? handleNodeDragStop : undefined}
              layoutKey={layoutKey}
              readOnly={readOnly}
              showMinimap={chrome?.minimap !== false}
              showControls={chrome?.controls !== false}
            />
            {/* Canvas comments overlay */}
            {state.activeWorkflow && (() => {
              const comments = state.document.meta.workflowUi[state.activeWorkflow!]?.comments;
              if (!comments) return null;
              return Object.values(comments).map((c) => (
                <CommentNode
                  key={c.id}
                  comment={c}
                  disabled={readOnly}
                  onUpdate={(updates) =>
                    actions.dispatch({
                      op: "updateComment",
                      workflow: state.activeWorkflow!,
                      commentId: c.id,
                      updates,
                    })
                  }
                  onRemove={() =>
                    actions.dispatch({
                      op: "removeComment",
                      workflow: state.activeWorkflow!,
                      commentId: c.id,
                    })
                  }
                />
              ));
            })()}
          </div>
          {chrome?.inspector !== false && (
          <Inspector
            document={state.document}
            selection={state.selection}
            issues={derived.issues}
            readOnly={readOnly}
            onDispatch={dispatch}
            onSelectionChange={actions.setSelection}
            onRequestDeleteState={requestDeleteState}
          />
          )}
        </div>
        {pendingAddState && state.activeWorkflow && (
          <AddStateModal
            existingNames={Object.keys(
              state.document.session.workflows.find(
                (w) => w.name === state.activeWorkflow,
              )?.states ?? {},
            )}
            onCreate={confirmAddState}
            onCancel={() => setPendingAddState(false)}
          />
        )}
        {pendingDelete && (
          <DeleteStateModal
            document={state.document}
            workflow={pendingDelete.workflow}
            stateCode={pendingDelete.stateCode}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
        {pendingConnect && pendingConnectState && (
          <DragConnectModal
            source={pendingConnectState}
            fromState={pendingConnect.fromState}
            toState={pendingConnect.toState}
            onCreate={confirmConnect}
            onCancel={() => setPendingConnect(null)}
          />
        )}
      </div>
    </I18nContext.Provider>
  );
}

function normalizeViewport(viewport: EditorViewport): EditorViewport {
  return {
    x: Math.round(viewport.x * 100) / 100,
    y: Math.round(viewport.y * 100) / 100,
    zoom: Math.round(viewport.zoom * 1000) / 1000,
  };
}

function sameViewport(a: EditorViewport, b: EditorViewport): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}
