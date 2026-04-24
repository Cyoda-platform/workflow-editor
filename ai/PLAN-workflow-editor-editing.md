# Fix Drag-to-Connect in `workflow-editor`

## Summary
Make transition creation reliably work when the user drags from one state anchor to another state. The current editor only succeeds when the pointer lands on another tiny `8x8` target handle, which makes the feature feel broken. The fix should make connection targets forgiving, keep the existing “name the transition in a modal” flow, and add test coverage for the connect path.

## Implementation Changes
- In `packages/workflow-react/src/components/RfStateNode.tsx`, replace the current overlapping `source`/`target` dot handles with a single handle per side (`top`, `right`, `bottom`, `left`) and make the hit area much larger.
  - Use side-only handle ids (`top`, `right`, `bottom`, `left`) instead of `top-source` / `top-target`.
  - Keep the visible dot small if desired, but give each handle an invisible edge-sized hitbox so dropping onto a state edge is easy.
  - Use one handle per side so source/target overlap cannot interfere with pointer events.

- In `packages/workflow-react/src/components/Canvas.tsx`, switch React Flow to loose connection mode and align edge anchoring with the new side-only handle ids.
  - Set `connectionMode={ConnectionMode.Loose}`.
  - Update `anchorHandleId(...)` to return `top | right | bottom | left` directly, with defaults `bottom` for source and `top` for target.
  - Leave layout behavior unchanged for this task.

- In `packages/workflow-react/src/components/WorkflowEditor.tsx`, make the connect-resolution path explicit and testable.
  - Extract the logic that resolves a React Flow `Connection` into `{ workflow, fromState, toState } | null` into a small pure helper.
  - Accept valid node-to-node connections even when handle metadata is absent or simplified.
  - Keep the existing same-workflow restriction.
  - Preserve the current modal flow: a successful drop opens `DragConnectModal`, and the transition is only created after the user enters a valid name and confirms.

- In `packages/workflow-react/src/modals/DragConnectModal.tsx`, no behavioral change is needed beyond confirming the existing create/cancel behavior still works with the new connect path.

- Do not implement manual node dragging in this change.
  - `Canvas.tsx` currently re-runs ELK layout on every graph change and does not persist node positions, so freeform state movement is a separate feature.
  - Do not mix that work into this fix.

## Public API / Interface Impact
- No external package API changes are required.
- Internal React Flow handle ids will change from `*-source` / `*-target` to side-only ids. Update internal edge rendering assumptions accordingly.
- Editor behavior change: users should be able to drag from a state anchor and successfully drop onto another state’s edge/anchor area without pixel-perfect targeting.

## Test Plan
- Add unit tests for the extracted connect-resolution helper:
  - valid same-workflow source/target resolves to pending connect data
  - cross-workflow source/target returns `null`
  - missing source or target returns `null`
  - connection still resolves when handle ids are omitted or simplified

- Add a `WorkflowEditor` integration test using a mocked/stubbed `Canvas` component:
  - trigger `onConnect` with a valid connection
  - verify `DragConnectModal` appears
  - enter a valid transition name and confirm
  - assert `onChange` receives a document containing the new transition

- Add a negative integration test:
  - trigger `onConnect` with a cross-workflow or invalid connection
  - verify the modal does not open and no document change occurs

- Validate manually in the consumer app after rebuilding `workflow-editor`:
  - rebuild the package outputs used by `cyoda-launchpad`
  - open `http://localhost:8080/dev/workflow-editor-temp`
  - drag from one state side to another state and confirm the modal appears consistently
  - create the transition and verify it appears in both the visual editor and JSON tab

## Assumptions
- Scope is limited to fixing state-to-state connection creation.
- Overlapping graph layout and manual per-node repositioning are out of scope for this change.
- The website temp page already consumes `workflow-editor` package builds, so no `cyoda-launchpad` code change should be needed beyond refreshing after the rebuilt packages are available.
