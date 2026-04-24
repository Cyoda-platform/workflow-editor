import type { Connection } from "reactflow";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";

export interface PendingConnect {
  workflow: string;
  fromState: string;
  toState: string;
}

/**
 * Resolves a React Flow Connection into pending connect data.
 * Returns null if source/target are missing, not found in the document,
 * or belong to different workflows.
 */
export function resolveConnection(
  doc: WorkflowEditorDocument,
  connection: Connection,
): PendingConnect | null {
  const { source, target } = connection;
  if (!source || !target) return null;

  const sourcePtr = doc.meta.ids.states[source];
  const targetPtr = doc.meta.ids.states[target];

  if (!sourcePtr || !targetPtr) return null;
  if (sourcePtr.workflow !== targetPtr.workflow) return null;

  return {
    workflow: sourcePtr.workflow,
    fromState: sourcePtr.state,
    toState: targetPtr.state,
  };
}
