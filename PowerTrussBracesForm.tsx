import { useEffect, useState } from "react";
import type { WorkflowOutputRow, WorkPackFileData } from "../../../types";
import { useCustomerCalculator } from "../../useCustomerCalculator";
import { formatInputNumber as fmt, nonNegativeNumber as num } from "../support/normalization";

type Props = { data: WorkPackFileData; onChange: (data: WorkPackFileData) => void };
type Calculation = {
  rows: Array<{ code: string; description: string; qty: number; unit: string; source: string }>;
  outputRows: WorkflowOutputRow[];
};
type BraceType = "Column" | "Brace";
type BraceDraft = { wallHeight: string; length: string; type: BraceType; qty: string };
type BraceRow = BraceDraft & { id: string };

const parse = <T,>(value: string | undefined, fallback: T): T => {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const emptyDraft = (): BraceDraft => ({ wallHeight: "", length: "", type: "Column", qty: "1" });
const numericChange = (value: string, onValid: (value: string) => void) => {
  if (/^\d*(?:[.,]\d*)?$/.test(value)) onValid(value);
};

export function isBunNswActPowerTrussBraces(sheet = "", name = "", id = "") {
  return id === "power-truss-braces" || [sheet, name].some((value) => value.trim().toLowerCase() === "power truss braces");
}

export default function BunNswActPowerTrussBracesForm({ data, onChange }: Props) {
  const [rows, setRows] = useState<BraceRow[]>(() => parse<BraceRow[]>(data.fields.power_truss_braces_rows, []));
  const [draft, setDraft] = useState<BraceDraft>(emptyDraft());
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<BraceRow | null>(null);

  useEffect(() => {
    const rowsJson = JSON.stringify(rows);
    if (data.fields.power_truss_braces_rows === rowsJson) return;
    onChange({ ...data, fields: { ...data.fields, power_truss_braces_rows: rowsJson } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const fallback: Calculation = { rows: [], outputRows: [] };
  const { result: calculation, status } = useCustomerCalculator<Calculation>("BUN-NSW-ACT", "power-truss-braces", { rows }, fallback);

  useEffect(() => {
    if (status !== "ok") return;
    const manual = data.rows.filter((row) => !String(row.comments || "").startsWith("Power Truss"));
    const nextRows = [...calculation.outputRows, ...manual];
    if (JSON.stringify(data.rows) === JSON.stringify(nextRows)) return;
    onChange({ ...data, rows: nextRows });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculation.outputRows, status]);

  const add = () => {
    if (!draft.wallHeight.trim() || !draft.length.trim() || !num(draft.qty)) {
      setError("Enter wall height, length and quantity.");
      return;
    }
    setRows([...rows, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ...draft }]);
    setDraft(emptyDraft());
    setError("");
  };
  const save = () => {
    if (!editing) return;
    setRows(rows.map((row) => row.id === editing.id ? editing : row));
    setEditing(null);
  };
  const remove = (row: BraceRow) => {
    if (!window.confirm(`Delete ${row.wallHeight}X${row.length}MM Power Truss ${row.type}?`)) return;
    setRows(rows.filter((item) => item.id !== row.id));
    if (editing?.id === row.id) setEditing(null);
  };

  return <div className="fh-module fixout-module">
    <header className="module-heading fh-title-row"><div><h1>Power Truss Braces</h1><p>Column and brace power truss schedule.</p></div></header>

    <section className="fh-card">
      <div className="fh-card-title">1. Power truss braces</div>
      <div className="fixout-form-grid fixout-mode-form-grid">
        <label className="fh-field"><span>Wall Height</span><input className="fh-required" value={draft.wallHeight} onChange={(event) => numericChange(event.target.value, (wallHeight) => setDraft({ ...draft, wallHeight }))}/></label>
        <label className="fh-field"><span>Length</span><input className="fh-required" value={draft.length} onChange={(event) => numericChange(event.target.value, (length) => setDraft({ ...draft, length }))}/></label>
        <label className="fh-field"><span>Type</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as BraceType })}><option value="Column">Column</option><option value="Brace">Brace</option></select></label>
        <label className="fh-field"><span>Qty</span><input className="fh-required" value={draft.qty} onChange={(event) => numericChange(event.target.value, (qty) => setDraft({ ...draft, qty }))}/></label>
        <button className="fh-add-wall" type="button" onClick={add}>+ Add Power Truss</button>
      </div>
      {error && <div className="fh-hint error">{error}</div>}
    </section>

    <section className="fh-card">
      <div className="fh-card-title">2. Entered power truss braces</div>
      <div className="fh-table-wrap"><table className="fh-table shelving-rows-table"><thead><tr>
        <th>#</th><th>Wall Height</th><th>Length</th><th>Type</th><th>Qty</th><th></th>
      </tr></thead><tbody>{rows.map((row, index) => {
        const rowEditing = editing?.id === row.id, current = rowEditing && editing ? editing : row;
        return <tr key={row.id} className={rowEditing ? "ui-editing-row" : ""}>
          <td>{index + 1}</td>
          <td>{rowEditing ? <input value={current.wallHeight} onChange={(event) => setEditing({ ...current, wallHeight: event.target.value })}/> : row.wallHeight}</td>
          <td>{rowEditing ? <input value={current.length} onChange={(event) => setEditing({ ...current, length: event.target.value })}/> : row.length}</td>
          <td>{rowEditing ? <select value={current.type} onChange={(event) => setEditing({ ...current, type: event.target.value as BraceType })}><option value="Column">Column</option><option value="Brace">Brace</option></select> : row.type}</td>
          <td>{rowEditing ? <input value={current.qty} onChange={(event) => setEditing({ ...current, qty: event.target.value })}/> : row.qty}</td>
          <td><div className="ui-row-actions">{rowEditing ? <><button className="ui-row-save" type="button" onClick={save}>Save</button><button className="ui-row-cancel" type="button" onClick={() => setEditing(null)}>×</button></> : <><button className="ui-row-edit" type="button" onClick={() => setEditing({ ...row })}>Edit</button><button className="fh-remove" type="button" aria-label="Delete power truss" onClick={() => remove(row)}>×</button></>}</div></td>
        </tr>;
      })}</tbody></table>{!rows.length && <div className="fh-empty">No power truss braces entered.</div>}</div>
    </section>

    <section className="fh-card">
      <div className="fh-card-title">3. Automatic Power Truss Braces schedule</div>
      <div className="fh-table-wrap"><table className="fh-table fh-output-table"><thead><tr><th>Description</th><th>Quantity</th><th>Unit</th><th>Code</th></tr></thead><tbody>{calculation.rows.filter((row) => row.qty > 0).map((row, index) => <tr key={index}><td>{row.description}</td><td>{fmt(row.qty)}</td><td>{row.unit}</td><td>{row.code || "—"}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
