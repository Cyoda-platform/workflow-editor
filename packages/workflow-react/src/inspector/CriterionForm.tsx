import { useState } from "react";
import type {
  ArrayCriterion,
  Criterion,
  DomainPatch,
  FunctionCriterion,
  GroupCriterion,
  HostRef,
  LifecycleCriterion,
  OperatorType,
  SimpleCriterion,
} from "@cyoda/workflow-core";
import { OPERATOR_TYPES } from "@cyoda/workflow-core";

const LIFECYCLE_FIELDS = ["state", "creationDate", "previousTransition"] as const;
const OPERATORS = Array.from(OPERATOR_TYPES) as OperatorType[];
const OPERATOR_OPTIONS = OPERATORS.map((o) => ({ value: o, label: o }));
const CRITERION_TYPES = ["simple", "group", "function", "lifecycle", "array"] as const;
const GROUP_OPERATORS = ["AND", "OR", "NOT"] as const;

interface CriterionFormProps {
  host: HostRef;
  path: string[];
  criterion: Criterion | undefined;
  disabled: boolean;
  onDispatch: (patch: DomainPatch) => void;
  depth?: number;
}

export function CriterionSection({
  host,
  criterion,
  disabled,
  onDispatch,
}: {
  host: HostRef;
  stateCode?: string;
  transitionUuid?: string;
  workflowName?: string;
  criterion: Criterion | undefined;
  disabled: boolean;
  onDispatch: (patch: DomainPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const path = ["criterion"];

  const removeCriterion = () =>
    onDispatch({ op: "setCriterion", host, path, criterion: undefined });

  if (!criterion && !editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHeader label="Criterion" badge="none" />
        {!disabled && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={ghostBtn}
            data-testid="inspector-criterion-add"
          >
            + Add Criterion
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <SectionHeader label="Criterion" badge={criterion?.type ?? "editing"} />
      {editing || !criterion ? (
        <CriterionForm
          host={host}
          path={path}
          criterion={criterion}
          disabled={disabled}
          onDispatch={(patch) => {
            onDispatch(patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                style={ghostBtn}
                data-testid="inspector-criterion-edit"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={removeCriterion}
                style={dangerBtn}
                data-testid="inspector-criterion-remove"
              >
                Remove
              </button>
            </>
          )}
          <CriterionSummary criterion={criterion} />
        </div>
      )}
    </div>
  );
}

function CriterionForm({
  host,
  path,
  criterion,
  disabled,
  onDispatch,
  onCancel,
  depth = 0,
}: CriterionFormProps & { onCancel?: () => void }) {
  const [useJson, setUseJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() =>
    criterion ? JSON.stringify(criterion, null, 2) : '{"type":"simple","jsonPath":"","operation":"EQUALS"}',
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [localType, setLocalType] = useState<string>(criterion?.type ?? "simple");

  const commit = (c: Criterion) =>
    onDispatch({ op: "setCriterion", host, path, criterion: c });

  const commitJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft) as Criterion;
      if (!CRITERION_TYPES.includes(parsed.type as (typeof CRITERION_TYPES)[number])) {
        setJsonError(`Unknown criterion type "${parsed.type}"`);
        return;
      }
      setJsonError(null);
      commit(parsed);
    } catch (e) {
      setJsonError("Invalid JSON");
    }
  };

  const initialCriterion = (): Criterion => {
    switch (localType) {
      case "simple":
        return { type: "simple", jsonPath: "", operation: "EQUALS" };
      case "group":
        return { type: "group", operator: "AND", conditions: [] };
      case "function":
        return { type: "function", function: { name: "" } };
      case "lifecycle":
        return { type: "lifecycle", field: "state", operation: "EQUALS" };
      case "array":
        return { type: "array", jsonPath: "", operation: "EQUALS", value: [] };
      default:
        return { type: "simple", jsonPath: "", operation: "EQUALS" };
    }
  };

  if (useJson) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <textarea
          value={jsonDraft}
          onChange={(e) => { setJsonDraft(e.target.value); setJsonError(null); }}
          rows={8}
          disabled={disabled}
          data-testid="criterion-json-editor"
          style={{ fontFamily: "monospace", fontSize: 12, padding: 6, border: "1px solid #CBD5E1", borderRadius: 4 }}
        />
        {jsonError && <div role="alert" style={{ color: "#B91C1C", fontSize: 12 }}>{jsonError}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setUseJson(false)} style={ghostBtn}>Form view</button>
          <button type="button" onClick={commitJson} disabled={disabled} style={primaryBtn} data-testid="criterion-json-apply">Apply</button>
          {onCancel && <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: depth > 0 ? 12 : 0, borderLeft: depth > 0 ? "2px solid #E2E8F0" : undefined }}>
      {/* Type selector */}
      <label style={labelStyle}>
        <span>Type</span>
        <select
          value={localType}
          disabled={disabled}
          onChange={(e) => setLocalType(e.target.value)}
          style={selectStyle}
          data-testid="criterion-type-select"
        >
          {CRITERION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      {localType === "simple" && (
        <SimpleCriterionFields
          criterion={criterion?.type === "simple" ? criterion : null}
          disabled={disabled}
          onCommit={commit}
        />
      )}
      {localType === "group" && (
        <GroupCriterionFields
          criterion={criterion?.type === "group" ? criterion : null}
          host={host}
          path={path}
          disabled={disabled}
          onDispatch={onDispatch}
          onCommit={commit}
          depth={depth}
        />
      )}
      {localType === "function" && (
        <FunctionCriterionFields
          criterion={criterion?.type === "function" ? criterion : null}
          disabled={disabled}
          onCommit={commit}
        />
      )}
      {localType === "lifecycle" && (
        <LifecycleCriterionFields
          criterion={criterion?.type === "lifecycle" ? criterion : null}
          disabled={disabled}
          onCommit={commit}
        />
      )}
      {localType === "array" && (
        <ArrayCriterionFields
          criterion={criterion?.type === "array" ? criterion : null}
          disabled={disabled}
          onCommit={commit}
        />
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={() => { setUseJson(true); setJsonDraft(JSON.stringify(criterion ?? initialCriterion(), null, 2)); }} style={ghostBtn} data-testid="criterion-edit-json">
          Edit as JSON
        </button>
        {onCancel && <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>}
      </div>
    </div>
  );
}

function SimpleCriterionFields({
  criterion,
  disabled,
  onCommit,
}: {
  criterion: SimpleCriterion | null;
  disabled: boolean;
  onCommit: (c: Criterion) => void;
}) {
  const [jsonPath, setJsonPath] = useState(criterion?.jsonPath ?? "");
  const [operation, setOperation] = useState<OperatorType>(criterion?.operation ?? "EQUALS");
  const [value, setValue] = useState(criterion?.value !== undefined ? JSON.stringify(criterion.value) : "");

  const apply = () => {
    let parsed: unknown = undefined;
    if (value.trim()) {
      try { parsed = JSON.parse(value); } catch { parsed = value; }
    }
    onCommit({ type: "simple", jsonPath, operation, ...(parsed !== undefined ? { value: parsed as never } : {}) });
  };

  return (
    <>
      <InputField label="jsonPath" value={jsonPath} disabled={disabled} onChange={setJsonPath} testId="criterion-simple-path" />
      <label style={labelStyle}>
        <span>Operation</span>
        <select value={operation} disabled={disabled} onChange={(e) => setOperation(e.target.value as OperatorType)} style={selectStyle} data-testid="criterion-simple-op">
          {OPERATOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <InputField label="Value (JSON)" value={value} disabled={disabled} onChange={setValue} testId="criterion-simple-value" />
      {!disabled && <button type="button" onClick={apply} style={primaryBtn} data-testid="criterion-simple-apply">Apply</button>}
    </>
  );
}

function GroupCriterionFields({
  criterion,
  host,
  path,
  disabled,
  onDispatch,
  onCommit,
  depth,
}: {
  criterion: GroupCriterion | null;
  host: HostRef;
  path: string[];
  disabled: boolean;
  onDispatch: (patch: DomainPatch) => void;
  onCommit: (c: Criterion) => void;
  depth: number;
}) {
  const [operator, setOperator] = useState<"AND" | "OR" | "NOT">(criterion?.operator ?? "AND");
  const conditions = criterion?.conditions ?? [];

  const applyOperator = () => {
    onCommit({ type: "group", operator, conditions });
  };

  const addCondition = () => {
    const newConditions = [...conditions, { type: "simple" as const, jsonPath: "", operation: "EQUALS" as const }];
    onCommit({ type: "group", operator, conditions: newConditions });
  };

  const removeCondition = (idx: number) => {
    const newConditions = conditions.filter((_, i) => i !== idx);
    onCommit({ type: "group", operator, conditions: newConditions });
  };

  return (
    <>
      <label style={labelStyle}>
        <span>Operator</span>
        <select value={operator} disabled={disabled} onChange={(e) => { setOperator(e.target.value as typeof operator); }} style={selectStyle} data-testid="criterion-group-op">
          {GROUP_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      {!disabled && <button type="button" onClick={applyOperator} style={primaryBtn} data-testid="criterion-group-apply">Apply operator</button>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {conditions.map((cond, idx) => (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>Condition {idx + 1}</span>
              {!disabled && (
                <button type="button" onClick={() => removeCondition(idx)} style={{ ...dangerBtn, padding: "2px 6px", fontSize: 11 }}>
                  Remove
                </button>
              )}
            </div>
            <CriterionForm
              host={host}
              path={[...path, "conditions", String(idx)]}
              criterion={cond}
              disabled={disabled}
              onDispatch={onDispatch}
              depth={depth + 1}
            />
          </div>
        ))}
      </div>
      {!disabled && (
        <button type="button" onClick={addCondition} style={ghostBtn} data-testid="criterion-group-add-condition">
          + Add Condition
        </button>
      )}
    </>
  );
}

function FunctionCriterionFields({
  criterion,
  disabled,
  onCommit,
}: {
  criterion: FunctionCriterion | null;
  disabled: boolean;
  onCommit: (c: Criterion) => void;
}) {
  const [name, setName] = useState(criterion?.function.name ?? "");
  const [config, setConfig] = useState(() =>
    criterion?.function.config ? JSON.stringify(criterion.function.config, null, 2) : "",
  );
  const [configError, setConfigError] = useState<string | null>(null);

  const apply = () => {
    let parsedConfig: FunctionCriterion["function"]["config"] | undefined;
    if (config.trim()) {
      try { parsedConfig = JSON.parse(config); setConfigError(null); }
      catch { setConfigError("Invalid JSON config"); return; }
    }
    onCommit({ type: "function", function: { name, ...(parsedConfig ? { config: parsedConfig } : {}), ...(criterion?.function.criterion ? { criterion: criterion.function.criterion } : {}) } });
  };

  return (
    <>
      <InputField label="Function name" value={name} disabled={disabled} onChange={setName} testId="criterion-fn-name" />
      <label style={labelStyle}>
        <span>Config (JSON, optional)</span>
        <textarea
          value={config}
          onChange={(e) => { setConfig(e.target.value); setConfigError(null); }}
          disabled={disabled}
          rows={3}
          data-testid="criterion-fn-config"
          style={{ fontFamily: "monospace", fontSize: 12, padding: 6, border: "1px solid #CBD5E1", borderRadius: 4 }}
        />
      </label>
      {configError && <div role="alert" style={{ color: "#B91C1C", fontSize: 12 }}>{configError}</div>}
      {!disabled && <button type="button" onClick={apply} style={primaryBtn} data-testid="criterion-fn-apply">Apply</button>}
    </>
  );
}

function LifecycleCriterionFields({
  criterion,
  disabled,
  onCommit,
}: {
  criterion: LifecycleCriterion | null;
  disabled: boolean;
  onCommit: (c: Criterion) => void;
}) {
  const [field, setField] = useState<(typeof LIFECYCLE_FIELDS)[number]>(
    criterion?.field ?? "state",
  );
  const [operation, setOperation] = useState<OperatorType>(criterion?.operation ?? "EQUALS");
  const [value, setValue] = useState(criterion?.value !== undefined ? JSON.stringify(criterion.value) : "");

  const apply = () => {
    let parsed: unknown = undefined;
    if (value.trim()) {
      try { parsed = JSON.parse(value); } catch { parsed = value; }
    }
    onCommit({ type: "lifecycle", field, operation, ...(parsed !== undefined ? { value: parsed as never } : {}) });
  };

  return (
    <>
      <label style={labelStyle}>
        <span>Field</span>
        <select value={field} disabled={disabled} onChange={(e) => setField(e.target.value as typeof field)} style={selectStyle} data-testid="criterion-lifecycle-field">
          {LIFECYCLE_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      <label style={labelStyle}>
        <span>Operation</span>
        <select value={operation} disabled={disabled} onChange={(e) => setOperation(e.target.value as OperatorType)} style={selectStyle} data-testid="criterion-lifecycle-op">
          {OPERATOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <InputField label="Value (JSON)" value={value} disabled={disabled} onChange={setValue} testId="criterion-lifecycle-value" />
      {!disabled && <button type="button" onClick={apply} style={primaryBtn} data-testid="criterion-lifecycle-apply">Apply</button>}
    </>
  );
}

function ArrayCriterionFields({
  criterion,
  disabled,
  onCommit,
}: {
  criterion: ArrayCriterion | null;
  disabled: boolean;
  onCommit: (c: Criterion) => void;
}) {
  const [jsonPath, setJsonPath] = useState(criterion?.jsonPath ?? "");
  const [operation, setOperation] = useState<OperatorType>(criterion?.operation ?? "EQUALS");
  const [values, setValues] = useState<string[]>(criterion?.value ?? []);
  const [newItem, setNewItem] = useState("");

  const apply = () => onCommit({ type: "array", jsonPath, operation, value: values });

  const addItem = () => {
    if (newItem.trim()) { setValues([...values, newItem.trim()]); setNewItem(""); }
  };

  const removeItem = (idx: number) => setValues(values.filter((_, i) => i !== idx));

  return (
    <>
      <InputField label="jsonPath" value={jsonPath} disabled={disabled} onChange={setJsonPath} testId="criterion-array-path" />
      <label style={labelStyle}>
        <span>Operation</span>
        <select value={operation} disabled={disabled} onChange={(e) => setOperation(e.target.value as OperatorType)} style={selectStyle} data-testid="criterion-array-op">
          {OPERATOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "#475569" }}>Values</span>
        {values.map((v, idx) => (
          <div key={idx} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ flex: 1, fontSize: 12, padding: "4px 6px", background: "#F1F5F9", borderRadius: 3 }}>{v}</span>
            {!disabled && (
              <button type="button" onClick={() => removeItem(idx)} style={{ ...dangerBtn, padding: "2px 6px", fontSize: 11 }}>×</button>
            )}
          </div>
        ))}
        {!disabled && (
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
              placeholder="Add value…"
              style={{ ...inputStyle, flex: 1 }}
              data-testid="criterion-array-new-item"
            />
            <button type="button" onClick={addItem} style={ghostBtn}>Add</button>
          </div>
        )}
      </div>
      {!disabled && <button type="button" onClick={apply} style={primaryBtn} data-testid="criterion-array-apply">Apply</button>}
    </>
  );
}

function InputField({
  label, value, disabled, onChange, testId,
}: {
  label: string; value: string; disabled: boolean; onChange: (v: string) => void; testId?: string;
}) {
  return (
    <label style={labelStyle}>
      <span>{label}</span>
      <input type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={inputStyle} data-testid={testId} />
    </label>
  );
}

function CriterionSummary({ criterion }: { criterion: Criterion }) {
  if (criterion.type === "simple") {
    return (
      <span style={{ fontSize: 12, color: "#475569" }}>
        {criterion.jsonPath} {criterion.operation} {criterion.value !== undefined ? JSON.stringify(criterion.value) : ""}
      </span>
    );
  }
  if (criterion.type === "group") {
    return <span style={{ fontSize: 12, color: "#475569" }}>{criterion.operator} ({criterion.conditions.length} conditions)</span>;
  }
  if (criterion.type === "function") {
    return <span style={{ fontSize: 12, color: "#475569" }}>fn: {criterion.function.name}</span>;
  }
  if (criterion.type === "lifecycle") {
    return <span style={{ fontSize: 12, color: "#475569" }}>{criterion.field} {criterion.operation}</span>;
  }
  if (criterion.type === "array") {
    return <span style={{ fontSize: 12, color: "#475569" }}>{criterion.jsonPath} ({criterion.value.length} values)</span>;
  }
  return null;
}

function SectionHeader({ label, badge }: { label: string; badge: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#475569" }}>
        {label}
      </span>
      <span style={{ fontSize: 11, padding: "1px 6px", background: "#F1F5F9", borderRadius: 999, color: "#64748b" }}>
        {badge}
      </span>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#334155" };
const selectStyle: React.CSSProperties = { padding: "4px 6px", border: "1px solid #CBD5E1", borderRadius: 4, background: "white", fontSize: 12 };
const inputStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 12, border: "1px solid #CBD5E1", borderRadius: 4, background: "white" };
const ghostBtn: React.CSSProperties = { padding: "4px 8px", background: "white", border: "1px solid #CBD5E1", borderRadius: 4, fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { ...ghostBtn, background: "#0F172A", color: "white", borderColor: "#0F172A" };
const dangerBtn: React.CSSProperties = { ...ghostBtn, background: "#FEF2F2", borderColor: "#FCA5A5", color: "#B91C1C" };
