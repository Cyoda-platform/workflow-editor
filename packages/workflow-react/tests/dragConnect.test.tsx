import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { Connection } from "reactflow";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";
import type { CanvasProps } from "../src/components/Canvas.js";

// Capture the onConnect callback the WorkflowEditor passes to Canvas so tests
// can invoke it directly, without needing a real React Flow drag interaction.
let capturedOnConnect: ((c: Connection) => void) | undefined;

vi.mock("../src/components/Canvas.js", () => ({
  Canvas: ({ onConnect }: CanvasProps) => {
    capturedOnConnect = onConnect;
    return <div data-testid="mock-canvas" />;
  },
}));

function fixture(json: string): WorkflowEditorDocument {
  const result = parseImportPayload(json);
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

function stateId(doc: WorkflowEditorDocument, workflow: string, state: string): string {
  const entry = Object.entries(doc.meta.ids.states).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === state,
  );
  if (!entry) throw new Error(`No state id for ${workflow}:${state}`);
  return entry[0];
}

const TWO_STATE = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "start",
      active: true,
      states: {
        start: { transitions: [] },
        end: { transitions: [] },
      },
    },
  ],
});

const TWO_WF = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "alpha",
      initialState: "s1",
      active: true,
      states: { s1: { transitions: [] } },
    },
    {
      version: "1.0",
      name: "beta",
      initialState: "s2",
      active: true,
      states: { s2: { transitions: [] } },
    },
  ],
});

beforeEach(() => {
  capturedOnConnect = undefined;
});

afterEach(() => cleanup());

describe("WorkflowEditor drag-connect flow", () => {
  it("opens DragConnectModal when a valid same-workflow connection is triggered", () => {
    const doc = fixture(TWO_STATE);
    const srcId = stateId(doc, "wf", "start");
    const tgtId = stateId(doc, "wf", "end");

    render(<WorkflowEditor document={doc} />);

    act(() => {
      capturedOnConnect?.({
        source: srcId,
        target: tgtId,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(screen.getByTestId("dragconnect-name")).toBeTruthy();
  });

  it("entering a valid name and confirming calls onChange with the new transition", () => {
    const doc = fixture(TWO_STATE);
    const srcId = stateId(doc, "wf", "start");
    const tgtId = stateId(doc, "wf", "end");

    let lastDoc: WorkflowEditorDocument | undefined;
    render(<WorkflowEditor document={doc} onChange={(d) => { lastDoc = d; }} />);

    act(() => {
      capturedOnConnect?.({
        source: srcId,
        target: tgtId,
        sourceHandle: "bottom",
        targetHandle: "top",
      });
    });

    const input = screen.getByTestId("dragconnect-name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "go" } });
    fireEvent.click(screen.getByTestId("dragconnect-create"));

    // Modal should close
    expect(screen.queryByTestId("dragconnect-name")).toBeNull();

    // The onChange document should contain the new transition
    const wf = lastDoc?.session.workflows.find((w) => w.name === "wf");
    const transitions = wf?.states["start"]?.transitions ?? [];
    expect(transitions.some((t) => t.name === "go" && t.next === "end")).toBe(true);
  });

  it("cancel closes the modal without creating a transition", () => {
    const doc = fixture(TWO_STATE);
    const srcId = stateId(doc, "wf", "start");
    const tgtId = stateId(doc, "wf", "end");

    let lastDoc: WorkflowEditorDocument | undefined;
    render(<WorkflowEditor document={doc} onChange={(d) => { lastDoc = d; }} />);

    act(() => {
      capturedOnConnect?.({
        source: srcId,
        target: tgtId,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    fireEvent.click(screen.getByTestId("dragconnect-cancel"));

    expect(screen.queryByTestId("dragconnect-name")).toBeNull();

    const wf = lastDoc?.session.workflows.find((w) => w.name === "wf");
    const transitions = wf?.states["start"]?.transitions ?? [];
    expect(transitions).toHaveLength(0);
  });

  it("does not open the modal for a cross-workflow connection", () => {
    const doc = fixture(TWO_WF);
    const srcId = stateId(doc, "alpha", "s1");
    const tgtId = stateId(doc, "beta", "s2");

    render(<WorkflowEditor document={doc} />);

    act(() => {
      capturedOnConnect?.({
        source: srcId,
        target: tgtId,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(screen.queryByTestId("dragconnect-name")).toBeNull();
  });

  it("does not open the modal when source is null", () => {
    const doc = fixture(TWO_STATE);
    const tgtId = stateId(doc, "wf", "end");

    render(<WorkflowEditor document={doc} />);

    act(() => {
      capturedOnConnect?.({
        source: null,
        target: tgtId,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(screen.queryByTestId("dragconnect-name")).toBeNull();
  });
});
