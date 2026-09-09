import { useEffect, useRef, useState } from "react";
import ScheduleLoadingRow from "../../../components/ScheduleLoadingRow";
import type { WorkflowOutputRow, WorkPackFileData } from "../../../types";
import { useCustomerCalculator } from "../../useCustomerCalculator";
import { formatInputNumber as fmt, nonNegativeNumber as num } from "../support/normalization";

type Props = { data: WorkPackFileData; onChange: (data: WorkPackFileData) => void };
type CalculationRow = { key: string; code: string; description: string; qty: number; unit: string; source: string };
type Calculation = { rows: CalculationRow[]; outputRows: WorkflowOutputRow[] };
type ShelvingType = "robe" | "linen";
type ShelvingDraft = { type: ShelvingType; size: string; qty: string };
type ShelvingRow = ShelvingDraft & { id: string };

const SIZES = ["1500x450", "1800x450", "2400x450", "3000x450", "3600x450", "1500x600", "1800x600", "2400x600", "3000x600", "3600x600"];
const TYPE_LABELS: Record<ShelvingType, string> = { robe: "Robe", linen: "Linen" };
const EXTRAS: Array<[string, string]> = [
  ["2400x450", "Extra 2400x450mm melamine boards"],
  ["3600x450", "Extra 3600x450mm melamine boards"],
  ["2400x600", "Extra 2400x600mm melamine boards"],
  ["3600x600", "Extra 3600x600mm melamine boards"],
  ["42x18", "Extra 42x18 backs/sides"],
  ["68x18", "Extra 68x18 front lip"],
  ["mullion", "Extra 42x42 centre mullions"],
];

const parse = <T,>(value: string | undefined, fallback: T): T => {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const emptyDraft = (): ShelvingDraft => ({ type: "robe", size: SIZES[0], qty: "1" });
const numericChange = (value: string, onValid: (value: string) => void) => {
  if (/^\d*(?:[.,]\d*)?$/.test(value)) onValid(value);
};
const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function migrateSection(value: string | undefined, type: ShelvingType): ShelvingRow[] {
  const parsed = parse<unknown>(value, []);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => {
      const row = item as Partial<ShelvingRow>;
      return row.size && SIZES.includes(row.size) && num(row.qty) > 0
        ? [{ id: row.id || newId(), type, size: row.size, qty: fmt(num(row.qty)) }]
        : [];
    });
  }
  if (!parsed || typeof parsed !== "object") return [];
  return Object.entries(parsed as Record<string, unknown>).flatMap(([size, qty]) =>
    SIZES.includes(size) && num(qty) > 0 ? [{ id: newId(), type, size, qty: fmt(num(qty)) }] : []
  );
}

function initialRows(data: WorkPackFileData): ShelvingRow[] {
  if (!data.fields.shelving_entries) {
    return [...migrateSection(data.fields.shelving_robe, "robe"), ...migrateSection(data.fields.shelving_linen, "linen")];
  }
  return parse<Partial<ShelvingRow>[]>(data.fields.shelving_entries, []).flatMap((row) =>
    row.id && (row.type === "robe" || row.type === "linen") && row.size && SIZES.includes(row.size) && num(row.qty) > 0
      ? [{ id: row.id, type: row.type, size: row.size, qty: fmt(num(row.qty)) }]
      : []
  );
}

const sizeTotals = (rows: ShelvingRow[], type: ShelvingType) => Object.fromEntries(SIZES.map((size) => [
  size,
  rows.filter((row) => row.type === type && row.size === size).reduce((sum, row) => sum + num(row.qty), 0),
]));

export function isBunNswActShelving(sheet = "", name = "", id = "") {
  return id === "shelving" || [sheet, name].some((value) => value.trim().toLowerCase() === "shelving");
}

export default function BunNswActShelvingForm({ data, onChange }: Props) {
  const [rows, setRows] = useState<ShelvingRow[]>(() => initialRows(data));
  const [draft, setDraft] = useState<ShelvingDraft>(emptyDraft());
  const [extras, setExtras] = useState<Record<string, string>>(() => parse(data.fields.shelving_extras, {}));
  const [editing, setEditing] = useState<ShelvingRow | null>(null);
  const [error, setError] = useState("");
  const latestDataRef = useRef(data);
  const latestRowsRef = useRef(rows);
  const latestOnChangeRef = useRef(onChange);
  latestDataRef.current = data;
  latestRowsRef.current = rows;
  latestOnChangeRef.current = onChange;

  const persistFields = (nextRows: ShelvingRow[], nextExtras: Record<string, string>) => {
    const currentData = latestDataRef.current;
    latestOnChangeRef.current({ ...currentData, fields: {
      ...currentData.fields,
      shelving_entries: JSON.stringify(nextRows),
      shelving_extras: JSON.stringify(nextExtras),
    }});
  };

  const payload = {
    robe: sizeTotals(rows, "robe"),
    linen: sizeTotals(rows, "linen"),
    extras: Object.fromEntries(EXTRAS.map(([key]) => [key, num(extras[key])])),
  };
  const fallback: Calculation = { rows: [], outputRows: [] };
  const { result: calculation, status, error: calculationError } = useCustomerCalculator<Calculation>(
    "BUN-NSW-ACT", "shelving", payload, fallback,
  );

  useEffect(() => {
    if (status !== "ok") return;
    const currentData = latestDataRef.current;
    const manual = currentData.rows.filter((row) => !String(row.comments || "").startsWith("Shelving!"));
    const nextOutputRows = [...calculation.outputRows, ...manual];
    const fields = { ...currentData.fields, shelving_entries: JSON.stringify(latestRowsRef.current), shelving_extras: JSON.stringify(extras) };
    if (currentData.fields.shelving_entries === fields.shelving_entries
      && currentData.fields.shelving_extras === fields.shelving_extras
      && JSON.stringify(currentData.rows) === JSON.stringify(nextOutputRows)) return;
    latestOnChangeRef.current({ ...currentData, fields, rows: nextOutputRows });
  }, [calculation.outputRows, extras, status]);

  const add = () => {
    if (num(draft.qty) <= 0) { setError("Quantity must be greater than zero."); return; }
    const nextRows = [...latestRowsRef.current, { ...draft, id: newId(), qty: fmt(num(draft.qty)) }];
    latestRowsRef.current = nextRows; setRows(nextRows); persistFields(nextRows, extras);
    setDraft(emptyDraft()); setError("");
  };
  const save = () => {
    if (!editing) return;
    if (num(editing.qty) <= 0) { setError("Quantity must be greater than zero."); return; }
    const saved = { ...editing, qty: fmt(num(editing.qty)) };
    const nextRows = latestRowsRef.current.map((row) => row.id === saved.id ? saved : row);
    latestRowsRef.current = nextRows; setRows(nextRows); persistFields(nextRows, extras);
    setEditing(null); setError("");
  };
  const remove = (row: ShelvingRow) => {
    if (!window.confirm(`Delete ${TYPE_LABELS[row.type]} ${row.size}?`)) return;
    const nextRows = latestRowsRef.current.filter((item) => item.id !== row.id);
    latestRowsRef.current = nextRows; setRows(nextRows); persistFields(nextRows, extras);
    if (editing?.id === row.id) setEditing(null);
  };
  const updateExtra = (key: string, value: string) => {
    numericChange(value, (valid) => {
      const nextExtras = { ...extras, [key]: valid };
      setExtras(nextExtras); persistFields(latestRowsRef.current, nextExtras);
    });
  };

  return <div className="fh-module shelving-module">
    <header className="module-heading fh-title-row"><div><h1>Shelving</h1><p>Robe and linen shelving quantities calculated from the Bunnings workbook rules.</p></div></header>
    <section className="fh-card">
      <div className="fh-card-title">1. Shelving units</div>
      <div className="fh-form-grid">
        <label className="fh-field"><span>Type</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as ShelvingType })}><option value="robe">Robe</option><option value="linen">Linen</option></select></label>
        <label className="fh-field"><span>Shelving size</span><select value={draft.size} onChange={(event) => setDraft({ ...draft, size: event.target.value })}>{SIZES.map((size) => <option key={size}>{size}</option>)}</select></label>
        <label className="fh-field"><span>Quantity</span><input className="fh-required" inputMode="decimal" value={draft.qty} onChange={(event) => numericChange(event.target.value, (qty) => setDraft({ ...draft, qty }))}/></label>
        <button className="fh-add-wall" type="button" onClick={add}>+ Add Shelving</button>
      </div>
      <div className={error ? "fh-hint error" : "fh-hint"}>{error || "Double-click a row to edit it, then use ✓ to save that row."}</div>
    </section>

    <section className="fh-card"><div className="fh-card-title">2. Entered shelving</div>
      <div className="fh-table-wrap"><table className="fh-table shelving-rows-table"><thead><tr><th>#</th><th>Type</th><th>Size</th><th>Quantity</th><th></th></tr></thead><tbody>{rows.map((row, index) => {
        const rowEditing = editing?.id === row.id; const current = rowEditing && editing ? editing : row;
        return <tr key={row.id} className={`ui-editable-row${rowEditing ? " ui-editing-row" : ""}`} onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
          setEditing({ ...row }); setError("");
        }}><td>{index + 1}</td>
          <td>{rowEditing ? <select value={current.type} onChange={(event) => setEditing({ ...current, type: event.target.value as ShelvingType })}><option value="robe">Robe</option><option value="linen">Linen</option></select> : TYPE_LABELS[row.type]}</td>
          <td>{rowEditing ? <select value={current.size} onChange={(event) => setEditing({ ...current, size: event.target.value })}>{SIZES.map((size) => <option key={size}>{size}</option>)}</select> : row.size}</td>
          <td className="fh-number">{rowEditing ? <input inputMode="decimal" value={current.qty} onChange={(event) => numericChange(event.target.value, (qty) => setEditing({ ...current, qty }))}/> : row.qty}</td>
          <td><div className="ui-row-actions">{rowEditing ? <><button className="ui-row-save" type="button" onClick={save} aria-label="Save row" title="Save row">✓</button><button className="ui-row-cancel" type="button" onClick={() => { setEditing(null); setError(""); }} aria-label="Cancel editing">×</button></> : <button className="fh-remove" type="button" aria-label={`Delete ${row.size}`} onClick={() => remove(row)}>×</button>}</div></td>
        </tr>;
      })}</tbody></table>{!rows.length && <div className="fh-empty">No shelving entered.</div>}</div>
    </section>

    <section className="fh-card"><div className="fh-card-title">3. Manual extras</div><div className="fh-extra-grid">{EXTRAS.map(([key, label]) => <label className="fh-field" key={key}><span>{label}</span><input className="fh-required" inputMode="decimal" value={extras[key] ?? "0"} onChange={(event) => updateExtra(key, event.target.value)}/></label>)}</div></section>

    <section className="fh-card"><div className="fh-card-title">4. Automatic Shelving schedule</div>
      {calculationError && <div className="fh-hint error">{calculationError}</div>}
      <div className="fh-table-wrap"><table className="fh-table fh-output-table"><thead><tr><th>Description</th><th>Quantity</th><th>Unit</th><th>Code</th></tr></thead><tbody>
        {(status === "idle" || status === "loading") ? <ScheduleLoadingRow colSpan={4} label="Calculating Shelving schedule" />
          : calculation.rows.filter((row) => row.qty > 0).length ? calculation.rows.filter((row) => row.qty > 0).map((row) => <tr key={row.key}><td>{row.description}</td><td>{fmt(row.qty)}</td><td>{row.unit}</td><td>{row.code || "Match required"}</td></tr>)
            : <tr><td colSpan={4}>Enter Robe or Linen quantities to generate the schedule.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
