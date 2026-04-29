import type {
  DomainPatch,
  ExternalizedProcessor,
  ExternalizedProcessorConfig,
  Processor,
  ScheduledProcessor,
  Workflow,
} from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { CheckboxField, FieldGroup, SelectField, TextField } from "./fields.js";

const EXECUTION_MODES = [
  { value: "ASYNC_NEW_TX", label: "ASYNC_NEW_TX" },
  { value: "ASYNC_SAME_TX", label: "ASYNC_SAME_TX" },
  { value: "SYNC", label: "SYNC" },
] as const;

const PROCESSOR_TYPES = [
  { value: "externalized", label: "Externalized" },
  { value: "scheduled", label: "Scheduled" },
] as const;

export function ProcessorForm({
  processor,
  processorUuid,
  processorIndex,
  transitionUuid,
  workflow,
  disabled,
  onDispatch,
}: {
  processor: Processor;
  processorUuid: string;
  processorIndex: number;
  transitionUuid: string;
  workflow?: Workflow;
  disabled: boolean;
  onDispatch: (patch: DomainPatch) => void;
}) {
  const messages = useMessages();
  const update = (updates: Partial<Processor>) =>
    onDispatch({ op: "updateProcessor", processorUuid, updates });

  const updateExtConfig = (configUpdates: Partial<ExternalizedProcessorConfig>) => {
    if (processor.type !== "externalized") return;
    update({ config: { ...(processor.config ?? {}), ...configUpdates } } as Partial<ExternalizedProcessor>);
  };

  const isExternalized = processor.type === "externalized";
  const isScheduled = processor.type === "scheduled";

  // All transition names in the workflow for the scheduled target dropdown.
  const transitionNames: string[] = [];
  if (workflow) {
    for (const state of Object.values(workflow.states)) {
      for (const t of state.transitions) {
        if (!transitionNames.includes(t.name)) transitionNames.push(t.name);
      }
    }
  }
  const transitionOptions = transitionNames.map((n) => ({ value: n, label: n }));

  return (
    <FieldGroup title={messages.inspector.properties}>
      <TextField
        label={messages.inspector.name}
        value={processor.name}
        disabled={disabled}
        onCommit={(next) => update({ name: next } as Partial<Processor>)}
        testId="inspector-processor-name"
      />

      {/* Type switcher */}
      <SelectField
        label="Processor type"
        value={processor.type}
        options={PROCESSOR_TYPES}
        disabled={disabled}
        onChange={(next) => {
          if (next === processor.type) return;
          if (next === "externalized") {
            update({
              type: "externalized",
              executionMode: "ASYNC_NEW_TX",
              config: {},
            } as Partial<ExternalizedProcessor>);
          } else {
            update({
              type: "scheduled",
              config: { delayMs: 1000, transition: "" },
            } as Partial<ScheduledProcessor>);
          }
        }}
        testId="inspector-processor-type"
      />

      {/* Externalized fields */}
      {isExternalized && (
        <>
          <SelectField
            label={messages.inspector.executionMode}
            value={(processor as ExternalizedProcessor).executionMode ?? "ASYNC_NEW_TX"}
            options={EXECUTION_MODES}
            disabled={disabled}
            onChange={(next) =>
              update({ executionMode: next } as Partial<ExternalizedProcessor>)
            }
            testId="inspector-processor-execmode"
          />
          <CheckboxField
            label="Attach entity"
            checked={(processor as ExternalizedProcessor).config?.attachEntity ?? false}
            disabled={disabled}
            onChange={(next) => updateExtConfig({ attachEntity: next })}
            testId="inspector-processor-attachentity"
          />
          <TextField
            label="Response timeout (ms)"
            value={String((processor as ExternalizedProcessor).config?.responseTimeoutMs ?? 5000)}
            disabled={disabled}
            onCommit={(next) => {
              const parsed = Number.parseInt(next, 10);
              if (!Number.isFinite(parsed)) return;
              updateExtConfig({ responseTimeoutMs: parsed });
            }}
            testId="inspector-processor-timeout"
          />
          <TextField
            label="Calculation nodes tags"
            value={(processor as ExternalizedProcessor).config?.calculationNodesTags ?? ""}
            disabled={disabled}
            onCommit={(next) => updateExtConfig({ calculationNodesTags: next || undefined })}
            testId="inspector-processor-tags"
          />
          <TextField
            label="Retry policy"
            value={(processor as ExternalizedProcessor).config?.retryPolicy ?? ""}
            disabled={disabled}
            onCommit={(next) => updateExtConfig({ retryPolicy: next || undefined })}
            testId="inspector-processor-retry"
          />
          <TextField
            label="Context"
            value={(processor as ExternalizedProcessor).config?.context ?? ""}
            disabled={disabled}
            onCommit={(next) => updateExtConfig({ context: next || undefined })}
            testId="inspector-processor-context"
          />
          <CheckboxField
            label="Async result"
            checked={(processor as ExternalizedProcessor).config?.asyncResult ?? false}
            disabled={disabled}
            onChange={(next) => updateExtConfig({ asyncResult: next || undefined })}
            testId="inspector-processor-asyncresult"
          />
          <TextField
            label="Crossover to async (ms)"
            value={String((processor as ExternalizedProcessor).config?.crossoverToAsyncMs ?? "")}
            disabled={disabled}
            onCommit={(next) => {
              const parsed = next ? Number.parseInt(next, 10) : undefined;
              updateExtConfig({ crossoverToAsyncMs: parsed && Number.isFinite(parsed) ? parsed : undefined });
            }}
            testId="inspector-processor-crossover"
          />
        </>
      )}

      {/* Scheduled fields */}
      {isScheduled && (
        <>
          <TextField
            label="Delay (ms)"
            value={String((processor as ScheduledProcessor).config.delayMs)}
            disabled={disabled}
            onCommit={(next) => {
              const parsed = Number.parseInt(next, 10);
              if (!Number.isFinite(parsed)) return;
              update({
                config: {
                  ...(processor as ScheduledProcessor).config,
                  delayMs: parsed,
                },
              } as Partial<ScheduledProcessor>);
            }}
            testId="inspector-processor-delay"
          />
          {transitionOptions.length > 0 ? (
            <SelectField
              label="Target transition"
              value={(processor as ScheduledProcessor).config.transition}
              options={transitionOptions}
              disabled={disabled}
              onChange={(next) =>
                update({
                  config: {
                    ...(processor as ScheduledProcessor).config,
                    transition: next,
                  },
                } as Partial<ScheduledProcessor>)
              }
              testId="inspector-processor-target-transition"
            />
          ) : (
            <TextField
              label="Target transition"
              value={(processor as ScheduledProcessor).config.transition}
              disabled={disabled}
              onCommit={(next) =>
                update({
                  config: {
                    ...(processor as ScheduledProcessor).config,
                    transition: next,
                  },
                } as Partial<ScheduledProcessor>)
              }
              testId="inspector-processor-target-transition"
            />
          )}
          <TextField
            label="Timeout (ms, optional)"
            value={String((processor as ScheduledProcessor).config.timeoutMs ?? "")}
            disabled={disabled}
            onCommit={(next) => {
              const parsed = next ? Number.parseInt(next, 10) : undefined;
              update({
                config: {
                  ...(processor as ScheduledProcessor).config,
                  timeoutMs: parsed && Number.isFinite(parsed) ? parsed : undefined,
                },
              } as Partial<ScheduledProcessor>);
            }}
            testId="inspector-processor-timeout-scheduled"
          />
        </>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          disabled={disabled || processorIndex === 0}
          onClick={() =>
            onDispatch({
              op: "reorderProcessor",
              transitionUuid,
              processorUuid,
              toIndex: processorIndex - 1,
            })
          }
          style={ghostBtn}
        >
          {messages.inspector.moveUp}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onDispatch({
              op: "reorderProcessor",
              transitionUuid,
              processorUuid,
              toIndex: processorIndex + 1,
            })
          }
          style={ghostBtn}
        >
          {messages.inspector.moveDown}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDispatch({ op: "removeProcessor", processorUuid })}
          style={dangerBtn}
          data-testid="inspector-processor-delete"
        >
          {messages.inspector.removeProcessor}
        </button>
      </div>
    </FieldGroup>
  );
}

const ghostBtn = {
  padding: "4px 8px",
  background: "white",
  border: "1px solid #CBD5E1",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
};

const dangerBtn = {
  ...ghostBtn,
  background: "#FEF2F2",
  borderColor: "#FCA5A5",
  color: "#B91C1C",
};
