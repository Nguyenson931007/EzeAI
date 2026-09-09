import { useEffect, useMemo, useState } from "react";
import { getUsingFindItems, type UsingFindItem } from "../../../api";
import type { WorkflowOutputRow, WorkPackFileData } from "../../../types";
import { useCustomerCalculator } from "../../useCustomerCalculator";
import { formatInputNumber as fmt, nonNegativeNumber as num } from "../support/normalization";
import { ComboField } from "./FixoutForm";

type Props = { data: WorkPackFileData; onChange: (data: WorkPackFileData) => void };
type Calculation = {
  rows: Array<{ key: string; code: string; description: string; qty: number; unit: string; source: string }>;
  outputRows: WorkflowOutputRow[];
};
type PlumbingDraft = { itemName: string; code: string; description: string; qty: string; note: string };
type PlumbingRow = PlumbingDraft & { id: string };

// These are workbook input options, not products. Product code/description is
// loaded from using_find_items by the matching stable key.
const FOW_OPTIONS: Array<[string, string]> = [
  ["dishwasher-inline-tap", "Dishwasher Inline Tap"], ["kitchen-sink", "Kitchen Sink"],
  ["kitchen-sink-mixer", "Kitchen Sink Mixer"], ["toilet", "Toilet"],
  ["toilet-wall-cock", "Toilet Wall Cock"], ["shower-rail-single", "Shower on Rail Single"],
  ["shower-rail-double", "Shower on Rail Double"], ["shower-mixer-body", "Shower Mixer Body"],
  ["shower-mixer-trim", "Shower Mixer Trim"], ["bathtub-built-in", "Bathtub Built In"],
  ["bath-mixer-body", "Bath Mixer Body"], ["bath-mixer-trim", "Bath Mixer Trim"],
  ["bath-spout", "Bath Spout"], ["wall-basin-mixer-body", "Wall Basin Mixer Body"],
  ["wall-basin-mixer-trim", "Wall Basin Mixer Trim"], ["laundry-trough", "Laundry Trough"],
  ["laundry-mixer", "Laundry Mixer"], ["washing-machine-stops", "Washing Machine Stops"],
  ["toilet-roll-holder", "Toilet Roll Holder"], ["soap-holder", "Soap Holder"],
  ["towel-rail-single", "Towel Rail Single"], ["towel-rail-double", "Towel Rail Double"],
  ["vanity-wall-hung", "Vanity Wall Hung"], ["vanity-900-freestanding", "Vanity 900 Freestanding"],
];

const parse = <T,>(value: string | undefined, fallback: T): T => {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const emptyDraft = (): PlumbingDraft => ({ itemName: "", code: "", description: "", qty: "1", note: "" });

// Earlier saves stored one Qty (+ Note) per fixed catalog key. Migrate those
// into rows so existing jobs keep their data under the new add/entered layout.
const migrateRows = (data: WorkPackFileData, usages: Map<string, UsingFindItem>): PlumbingRow[] => {
  if (data.fields.fow_plumbing_rows) return parse<PlumbingRow[]>(data.fields.fow_plumbing_rows, []);
  const quantities = parse<Record<string, string>>(data.fields.fow_plumbing_quantities, {});
  const notes = parse<Record<string, string>>(data.fields.fow_plumbing_notes, {});
  return FOW_OPTIONS
    .filter(([key]) => num(quantities[key]) > 0)
    .map(([key, itemName]) => {
      const usage = usages.get(key);
      return ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      itemName, code: usage?.item_number ?? "", description: usage?.description ?? "",
      qty: quantities[key], note: notes[key] ?? "",
    });
    });
};

export function isBunNswActFowPlumbing(sheet = "", name = "", id = "") {
  return id === "fow-plumbing" || [sheet, name].some((value) => value.trim().toLowerCase() === "fow plumbing");
}

export default function BunNswActFowPlumbingForm({ data, onChange }: Props) {
  const [rows, setRows] = useState<PlumbingRow[]>(() => data.fields.fow_plumbing_rows ? parse(data.fields.fow_plumbing_rows, []) : []);
  const [catalog, setCatalog] = useState<UsingFindItem[]>([]);
  const [catalogReady, setCatalogReady] = useState(Boolean(data.fields.fow_plumbing_rows));
  const [draft, setDraft] = useState<PlumbingDraft>(emptyDraft());
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PlumbingRow | null>(null);
  const catalogByKey = useMemo(() => new Map(catalog.map((row) => [row.usage_key, row])), [catalog]);
  const itemNames = FOW_OPTIONS.map(([, name]) => name);

  useEffect(() => {
    let alive = true;
    getUsingFindItems("BUN-NSW-ACT", "fow-plumbing").then((items) => {
      if (!alive) return;
      setCatalog(items);
      if (!data.fields.fow_plumbing_rows) setRows(migrateRows(data, new Map(items.map((row) => [row.usage_key, row]))));
      setCatalogReady(true);
    }).catch(() => { if (alive) setCatalogReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!catalogReady) return;
    const rowsJson = JSON.stringify(rows);
    if (data.fields.fow_plumbing_rows === rowsJson) return;
    onChange({ ...data, fields: { ...data.fields, fow_plumbing_rows: rowsJson } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const payload = { rows: rows.map(({ itemName, code, description, qty, note }) => ({ itemName, code, description, qty: num(qty), note })) };
  const fallback: Calculation = { rows: [], outputRows: [] };
  const { result: calculation, status } = useCustomerCalculator<Calculation>("BUN-NSW-ACT", "fow-plumbing", payload, fallback);

  useEffect(() => {
    if (status !== "ok") return;
    const manual = data.rows.filter((row) => !String(row.comments || "").toLowerCase().startsWith("fow plumbing"));
    const nextRows = [...calculation.outputRows, ...manual];
    if (JSON.stringify(data.rows) === JSON.stringify(nextRows)) return;
    onChange({ ...data, rows: nextRows });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculation.outputRows, status]);

  const pickItemName = (itemName: string, apply: (patch: Partial<PlumbingDraft>) => void) => {
    const option = FOW_OPTIONS.find(([, name]) => name.toLowerCase() === itemName.toLowerCase());
    const match = option ? catalogByKey.get(option[0]) : undefined;
    apply(match ? { itemName, code: match.item_number ?? "", description: match.description ?? "" } : { itemName });
  };

  const add = () => {
    if (!draft.itemName.trim() || !draft.description.trim() || !num(draft.qty)) {
      setError("Enter item name, description and quantity.");
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
  const remove = (row: PlumbingRow) => {
    if (!window.confirm(`Delete ${row.itemName}?`)) return;
    setRows(rows.filter((item) => item.id !== row.id));
    if (editing?.id === row.id) setEditing(null);
  };

  return <div className="fh-module fixout-module">
    <header className="module-heading fh-title-row"><div><h1>FOW Plumbing</h1><p>Whole-of-house plumbing fixture schedule.</p></div></header>

    <section className="fh-card">
      <div className="fh-card-title">1. Plumbing fixtures</div>
      <div className="fixout-form-grid fixout-mode-form-grid">
        <ComboField label="Item Name" value={draft.itemName} values={itemNames} filter onChange={(itemName) => pickItemName(itemName, (patch) => setDraft({ ...draft, ...patch }))}/>
        <label className="fh-field"><span>Code</span><input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })}/></label>
        <label className="fh-field fixout-description"><span>Item Description</span><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label>
        <label className="fh-field"><span>Qty</span><input className="fh-required" value={draft.qty} onChange={(event) => /^\d*$/.test(event.target.value) && setDraft({ ...draft, qty: event.target.value })}/></label>
        <label className="fh-field"><span>Note</span><input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })}/></label>
        <button className="fh-add-wall" type="button" onClick={add}>+ Add Fixture</button>
      </div>
      {error && <div className="fh-hint error">{error}</div>}
      <datalist id="fow-plumbing-item-names">{itemNames.map((name) => <option key={name} value={name}/>)}</datalist>
    </section>

    <section className="fh-card">
      <div className="fh-card-title">2. Entered plumbing fixtures</div>
      <div className="fh-table-wrap"><table className="fh-table fow-plumbing-table"><thead><tr>
        <th>#</th><th>Item Name</th><th>Code</th><th>Item Description</th><th>Qty</th><th>Note</th><th></th>
      </tr></thead><tbody>{rows.map((row, index) => {
        const rowEditing = editing?.id === row.id, current = rowEditing && editing ? editing : row;
        return <tr key={row.id} className={rowEditing ? "ui-editing-row" : ""}>
          <td>{index + 1}</td>
          <td>{rowEditing ? <input list="fow-plumbing-item-names" value={current.itemName} onChange={(event) => pickItemName(event.target.value, (patch) => setEditing({ ...current, ...patch }))}/> : row.itemName}</td>
          <td>{rowEditing ? <input value={current.code} onChange={(event) => setEditing({ ...current, code: event.target.value })}/> : (row.code || "—")}</td>
          <td>{rowEditing ? <input value={current.description} onChange={(event) => setEditing({ ...current, description: event.target.value })}/> : row.description}</td>
          <td>{rowEditing ? <input value={current.qty} onChange={(event) => setEditing({ ...current, qty: event.target.value })}/> : row.qty}</td>
          <td>{rowEditing ? <input value={current.note} onChange={(event) => setEditing({ ...current, note: event.target.value })}/> : row.note}</td>
          <td><div className="ui-row-actions">{rowEditing ? <><button className="ui-row-save" type="button" onClick={save}>Save</button><button className="ui-row-cancel" type="button" onClick={() => setEditing(null)}>×</button></> : <><button className="ui-row-edit" type="button" onClick={() => setEditing({ ...row })}>Edit</button><button className="fh-remove" type="button" aria-label={`Delete ${row.itemName}`} onClick={() => remove(row)}>×</button></>}</div></td>
        </tr>;
      })}</tbody></table>{!rows.length && <div className="fh-empty">No plumbing fixtures entered.</div>}</div>
    </section>

    <section className="fh-card">
      <div className="fh-card-title">3. Automatic FOW Plumbing schedule</div>
      <div className="fh-table-wrap"><table className="fh-table fh-output-table"><thead><tr><th>Description</th><th>Quantity</th><th>Unit</th><th>Code</th></tr></thead><tbody>{calculation.rows.filter((row) => row.qty > 0).map((row, index) => <tr key={index}><td>{row.description}</td><td>{fmt(row.qty)}</td><td>{row.unit}</td><td>{row.code || "—"}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
