import "../styles/FixoutForm.css";
import { useEffect, useState } from "react";
import { getBunNswActLockupOptions, getEmsFixoutRows, getUsingFindItems, type EmsFixoutRow } from "../../../api";
import type { WorkflowOutputRow, WorkPackFileData } from "../../../types";
import CollapsibleSubgroup from "../../../components/CollapsibleSubgroup";
import { useCustomerCalculator } from "../../useCustomerCalculator";
import { formatInputNumber as fmt, nonNegativeNumber as num } from "../support/normalization";

type Furniture = "passage" | "privacy" | "dummy" | "privacy-dummy" | "passage-dummy" | "cavity-passage" | "cavity-privacy" | "face-door-passage" | "face-door-privacy" | "none";
type Stop = "cushion" | "ds2-riser" | "none";
export type FixoutMode = "cavity" | "prehung" | "loose-jamb";
type FrameType = "Timber Jamb" | "Ezy Jamb" | "Steel Frame";
export type FixoutDoor = {
  id: string; mode?: FixoutMode; label: string; doorName?: string;
  itemNumber: string; description: string; height: number; width: number; qty: number;
  configuration: "single" | "double"; thickness?: string; wallWidth?: string;
  frameType?: FrameType; liftOff?: string; handing?: string; hole?: string; finish?: string;
  furniture: Furniture; stop: Stop;
};

type Props = { data: WorkPackFileData; sourceFiles: Record<string, WorkPackFileData>; idJobHw?: string; onChange: (data: WorkPackFileData) => void };
type LockupDoor = { scope?: string; height: number; qty: number };
type Draft = {
  label: string; doorName: string; height: string; width: string; qty: string;
  configuration: FixoutDoor["configuration"]; thickness: string; wallWidth: string;
  frameType: FrameType; liftOff: string; handing: string; hole: string; finish: string;
  furniture: Furniture; stop: Stop;
};
type Calculation = {
  jambLm: number; archLm: number; jamb92Qty: number; jamb112Qty: number;
  hinges: number; liftOffLh: number; liftOffRh: number;
  revealTotal: number; revealBlockwork: number;
  archExtras: number; archExtDoors: number; archRobesCsd: number; archInt: number;
  smartRobeRows: WorkflowOutputRow[];
  rows: Array<{ key: string; code: string; description: string; qty: number; unit: string; source: string }>;
  outputRows: WorkflowOutputRow[];
};
type SmartRobeRow = { id: string; label: string; unitHeight: string; unitSize: string; wall: string; type: string; thicks: string };
type SmartRobeDraft = { label: string; unitHeight: string; unitSize: string; wall: string; type: string; thicks: string };
type RevealOpeningType = "window" | "door";
type RevealDraft = { type: RevealOpeningType; height: string; width: string; blockWork: string };
type RevealOpening = RevealDraft & { id: string };
const emptyRevealDraft = (): RevealDraft => ({ type: "window", height: "", width: "", blockWork: "No" });

const parse = <T,>(value: string | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const modeLabel = (mode?: FixoutMode) => mode === "cavity" ? "Cavity sliding" : mode === "loose-jamb" ? "Loose Jamb" : "Prehung";
const options = {
  frame: ["Timber Jamb", "Ezy Jamb", "Steel Frame"] as FrameType[],
  // Fixout!S22:S60 data validation list ("Lift Off / Pivot Frame").
  liftOff: ["", "LH LO", "RH LO", "PIVOT DOOR"],
  // Fixout!Y22:Y61 data validation list ("Handing") -- a separate column from
  // "Lift Off / Pivot Frame" above, with a wider set of values.
  handing: ["", "RH", "LH", "RH LO", "LH LO", "DBL DOOR SET", "SET of THREE", "SET of FOUR", "SET of SIX", "Set of EIGHT"],
  hole: ["", "HF", "HO"], finish: ["", "CHR", "SCH"],
  // Fixout!M22:M60 data validation list ("Height", Internal Doors Room table).
  // Rendered as suggestions on a free-text field -- real jobs need sizes outside these presets.
  height: ["2040", "2340", "2150", "2450"],
  // Fixout!N22:N60 data validation list ("Width", Internal Doors Room table).
  width: ["320", "370", "420", "460", "520", "570", "620", "720", "770", "820", "870", "920", "970", "1020", "1200"],
  // Fixout!M10:M19 data validation list ("Door Size", Cavity Sliding Units
  // table) -- a different preset list from the Internal Doors Room table above.
  cavityWidth: ["620", "720", "770", "820", "870", "920", "970", "1020", "1200", "1000"],
};
const FURNITURE_OPTIONS: Record<FixoutMode, Furniture[]> = {
  cavity: ["cavity-passage", "cavity-privacy", "face-door-passage", "face-door-privacy", "none"],
  prehung: ["passage", "privacy", "dummy", "privacy-dummy", "passage-dummy", "none"],
  "loose-jamb": ["passage", "privacy", "dummy", "privacy-dummy", "passage-dummy", "none"],
};
// Fixout!V10:V13 data validation list ("Door Furniture", Cavity table) uses
// "CSD Passage/Privacy Set" wording, distinct from the Furniture key names.
// Fixout!AM36:AM40 is the underlying list for the Internal Doors Room table's
// own Door Furniture column ("Privacy Set"/"Passage Set"/"Dummy Set"/"Privacy
// Dummy"/"Passage Dummy") -- plain "passage"/"privacy"/"dummy" need the "Set"
// suffix too, not just the capitalize() fallback.
export const FURNITURE_LABELS: Record<string, string> = {
  passage: "Passage Set", privacy: "Privacy Set", dummy: "Dummy Set",
  "cavity-passage": "CSD Passage Set", "cavity-privacy": "CSD Privacy Set",
  "privacy-dummy": "Privacy Dummy", "passage-dummy": "Passage Dummy",
  "face-door-passage": "Face Door Passage Set", "face-door-privacy": "Face Door Privacy Set",
};
const STOP_OPTIONS: Stop[] = ["cushion", "ds2-riser", "none"];
export const STOP_LABELS: Record<string, string> = { "ds2-riser": "DS2 with Riser" };

// Fixout!AB83:AD100 / AC83:AD100: total opening width -> door-leaf config.
// [width with 2 finger grips per door, width with no finger grips, config].
const SMART_ROBE_WIDTH_TABLE: Array<[string, string, string]> = [
  ["3670", "3460", "4X870"], ["2770", "2610", "3X870"], ["1870", "1760", "2X870"],
  ["3470", "3260", "4X820"], ["2620", "2460", "3X820"], ["1770", "1660", "2X820"],
  ["3270", "3060", "4X770"], ["2470", "2310", "3X770"], ["1670", "1560", "2X770"],
  ["3070", "2860", "4X720"], ["2320", "2160", "3X720"], ["1570", "1460", "2X720"],
  ["2670", "2460", "4X620"], ["2020", "1860", "3X620"], ["1370", "1260", "2X620"],
  ["2270", "2060", "4X520"], ["1720", "1560", "3X520"], ["1170", "1060", "2X520"],
];
const emptySmartRobeDraft = (): SmartRobeDraft => ({ label: "", unitHeight: "2040", unitSize: "", wall: "90", type: "", thicks: "16" });

// Workbook options stay in code; their product codes are resolved from Using.
const TRIM_OPTION_DEFINITIONS: Array<[string, string]> = [
  ["match-existing", "To Match Existing 5.4M"],
  ["mdf-dar-42x18", "MDF DAR PRIMED++42X18MM 5.4M"],
  ["mdf-dar-67x18", "MDF DAR PRIMED++67X18MM 5.4M"],
  ["mdf-dar-92x18", "MDF DAR PRIMED++92X18MM 5.4M"],
  ["pine-dar-42x18", "PINE PRIMED DAR FJ++42X18MM 5.4M"],
  ["pine-dar-66x18", "PINE PRIMED DAR FJ++66X18MM 5.4M"],
  ["pine-dar-92x18", "PINE PRIMED DAR FJ++92X18MM 5.4M"],
  ["mdf-bevel-42x18", "MDF MOULDING BEVEL++42X18MM 5.4M PRIMED"],
  ["mdf-bevel-67x18", "MDF MOULDING BEVEL++67X18MM 5.4M PRIMED"],
  ["mdf-bevel-92x18", "MDF MOULDING BEVEL++92X18MM 5.4M PRIMED"],
  ["mdf-colonial-42x18", "MDF MOULDING COLONIAL++42X18MM 5.4M PRIMED"],
  ["mdf-colonial-67x18", "MDF MOULDING COLONIAL++67X18MM 5.4M PRIMED"],
  ["mdf-colonial-92x18", "MDF MOULDING COLONIAL++92X18MM 5.4M PRIMED"],
  ["mdf-bullnose-42x18", "MDF MOULDING BULLNOSE++42X18MM 5.4M PRIMED"],
  ["mdf-bullnose-67x18", "MDF MOULDING BULLNOSE++67X18MM 5.4M PRIMED"],
  ["mdf-bullnose-92x18", "MDF MOULDING BULLNOSE++92X18MM 5.4M PRIMED"],
  ["mdf-half-splayed-67x18", "MDF MOULDING HALF SPLAYED++67X18MM 5.4M PRIMED"],
  ["mdf-half-splayed-92x18", "MDF MOULDING HALF SPLAYED++92X18MM 5.4M PRIMED"],
  ["mdf-lambs-tongue-67x18", "MDF MOULDING LAMBS TONGUE++67X18MM 5.4M PRIMED"],
  ["mdf-lambs-tongue-92x18", "MDF MOULDING LAMBS TONGUE++92X18MM 5.4M PRIMED"],
];

// Fixout!L22:L60 data validation list ("Label") -- suggestions only, free text
// is still accepted since real jobs need room names outside this preset list.
const ROOM_LABELS = [
  "Bed 1", "Bed 2", "Bed 3", "Bed 4", "Bed 5", "Bath", "ENS", "WC", "PDR", "Study", "Media", "Hall", "Garage",
  "Ldry", "Pantry", "WIR", "Master", "Linen", "Robe", "Store", "Broom", "WC 1", "WC 2", "Bath 1", "Bath 2",
  "PDR 1", "PDR 2", "ENS 1", "ENS 2", "ENS 3", "Linen 1", "Linen 2", "Robe 1", "Robe 2", "Robe 3", "Robe 4",
  "Living", "Dining", "Kitchen", "Office", "Meeting", "Kid one", "MPR", "WIP", "WIL", "CPD",
];

// Per-Label default Door Furniture / Door Stop / Hole for Prehung and
// Loose-jamb doors, per the user-supplied lookup table (Furniture: privacy ->
// "Privacy Set", passage -> "Passage Set", dummy -> "Dummy Set", none entered
// as a blank Door Stop). [furniture, stop, hole].
const ROOM_LABEL_SUGGESTIONS: Record<string, [Furniture, Stop, string]> = {
  "Bed 1": ["privacy", "cushion", "HF"], "Bed 2": ["passage", "cushion", "HF"],
  "Bed 3": ["passage", "cushion", "HF"], "Bed 4": ["passage", "cushion", "HF"],
  "Bed 5": ["passage", "cushion", "HF"], "Bath": ["privacy", "ds2-riser", "HF"],
  "ENS": ["privacy", "ds2-riser", "HF"], "WC": ["privacy", "ds2-riser", "HF"],
  "PDR": ["privacy", "ds2-riser", "HF"], "Study": ["passage", "cushion", "HF"],
  "Media": ["passage", "cushion", "HF"], "Hall": ["passage", "cushion", "HF"],
  "Garage": ["privacy", "cushion", "HF"], "Ldry": ["passage", "cushion", "HF"],
  "Pantry": ["passage", "cushion", "HF"], "WIR": ["passage", "cushion", "HF"],
  "Master": ["privacy", "cushion", "HF"], "Linen": ["dummy", "none", "HO"],
  "Robe": ["dummy", "none", "HO"], "Store": ["dummy", "none", "HO"],
  "Broom": ["dummy", "none", "HO"], "WC 1": ["privacy", "ds2-riser", "HF"],
  "WC 2": ["privacy", "ds2-riser", "HF"], "Bath 1": ["privacy", "ds2-riser", "HF"],
  "Bath 2": ["privacy", "ds2-riser", "HF"], "PDR 1": ["privacy", "ds2-riser", "HF"],
  "PDR 2": ["privacy", "ds2-riser", "HF"], "ENS 1": ["privacy", "ds2-riser", "HF"],
  "ENS 2": ["privacy", "ds2-riser", "HF"], "ENS 3": ["privacy", "ds2-riser", "HF"],
  "Linen 1": ["dummy", "none", "HO"], "Linen 2": ["dummy", "none", "HO"],
  "Robe 1": ["dummy", "none", "HO"], "Robe 2": ["dummy", "none", "HO"],
  "Robe 3": ["dummy", "none", "HO"], "Robe 4": ["dummy", "none", "HO"],
  "Living": ["passage", "cushion", "HF"], "Dining": ["passage", "cushion", "HF"],
  "Kitchen": ["passage", "cushion", "HF"], "Office": ["passage", "cushion", "HF"],
  "Meeting": ["passage", "cushion", "HF"], "Kid one": ["passage", "cushion", "HF"],
  "MPR": ["passage", "cushion", "HF"], "WIP": ["passage", "cushion", "HF"],
  "WIL": ["passage", "cushion", "HF"], "CPD": ["dummy", "none", "HO"],
};
// Handing values that force Hole to HO regardless of the Label's default.
const ROOM_SUGGESTION_HOLE_OVERRIDE_HANDINGS = new Set(["SET of THREE", "RH LO", "DBL DOOR SET"]);
const DUMMY_FURNITURE_VARIANT: Partial<Record<Furniture, Furniture>> = { privacy: "privacy-dummy", passage: "passage-dummy" };

// Recomputed whenever Label or (Prehung-only) Handing changes in the add-draft;
// Cavity doors and unrecognised Labels are left untouched.
function roomSuggestionPatch(mode: FixoutMode, label: string, handing: string): Partial<Draft> {
  const base = ROOM_LABEL_SUGGESTIONS[label];
  if (!base || mode === "cavity") return {};
  const [baseFurniture, stop, baseHole] = base;
  if (mode !== "prehung") return { furniture: baseFurniture, stop };
  const hole = ROOM_SUGGESTION_HOLE_OVERRIDE_HANDINGS.has(handing) ? "HO" : baseHole;
  const furniture = handing === "DBL DOOR SET" ? (DUMMY_FURNITURE_VARIANT[baseFurniture] ?? baseFurniture) : baseFurniture;
  return { furniture, stop, hole };
}

export function isBunNswActFixout(sheet = "", name = "", id = "") {
  return [sheet, name, id].some((value) => value.trim().toLowerCase() === "fixout");
}

const emptyDraft = (mode: FixoutMode): Draft => ({
  label: "", doorName: "", height: "2040", width: "820", qty: "1", configuration: "single",
  thickness: "35", wallWidth: "90", frameType: "Timber Jamb", liftOff: "", handing: "", hole: "", finish: "",
  furniture: mode === "cavity" ? "cavity-passage" : "passage", stop: "cushion" as Stop,
});

export const capitalize = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1) : "None";

function SelectField({ label, value, values, labels, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label className="fh-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((option) => <option key={option} value={option}>{labels?.[option] || capitalize(option)}</option>)}</select></label>;
}

// Fixout!M70/M73/M80/M83 "Type" selector for a trim item (arch/skirting/wet
// variants). Writes fixout_{key}_code + fixout_{key}_description, matching
// the backend's existing _fixout_override() lookup -- no backend change needed.
function TrimTypeField({ label, itemKey, defaultOptionKey, options, fields, onChange }: {
  label: string; itemKey: string; defaultOptionKey: string; options: Array<[string, string]>;
  fields: Record<string, string>; onChange: (patch: Record<string, string>) => void;
}) {
  const defaultDescription = TRIM_OPTION_DEFINITIONS.find(([key]) => key === defaultOptionKey)?.[1] ?? "";
  const description = fields[`fixout_${itemKey}_description`] ?? defaultDescription;
  const isSpec = !options.some(([desc]) => desc === description);
  const selectValue = isSpec ? "spec" : description;
  const specValue = isSpec ? description : "";
  return <>
    <ComboField
      label={label}
      value={selectValue}
      values={[...options.map(([desc]) => desc), "spec"]}
      selectOnly
      onChange={(value) => {
        const match = options.find(([desc]) => desc === value);
        const isSpecSelection = !match || match[0] === "spec";
        onChange({
          [`fixout_${itemKey}_description`]: isSpecSelection ? "" : match[0],
          [`fixout_${itemKey}_code`]: isSpecSelection ? "" : match[1],
        });
      }}
    />
    {selectValue === "spec" && <label className="fh-field"><span>{label} (spec)</span><input className="fh-required" value={specValue} onChange={(event) => onChange({ [`fixout_${itemKey}_description`]: event.target.value, [`fixout_${itemKey}_code`]: "" })}/></label>}
  </>;
}

// Preset sizes with a fallback to a custom value: shows a dropdown button with
// the preset list (Excel data validation), but the input still accepts any
// typed value for jobs that need a size outside the preset list.
export function ComboField({ label, value, values, numeric, filter, selectOnly, className, onChange }: { label: string; value: string; values: string[]; numeric?: boolean; filter?: boolean; selectOnly?: boolean; className?: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  // Once `value` already exactly matches a preset option, re-opening the menu
  // shows the full list instead of filtering down to just that one option --
  // otherwise switching from "Bed 1" to "Bed 2" required clearing the field
  // first. Filtering still narrows the list as soon as the user types further.
  const isCommittedSelection = values.includes(value);
  const options = filter && value.trim() && !isCommittedSelection ? values.filter((option) => option.toLowerCase().includes(value.trim().toLowerCase())) : values;
  return <label className={`fh-field fixout-combo-field ${className || ""}`}>
    <span>{label}</span>
    <div className="fixout-combo-wrap">
      <input
        value={value}
        readOnly={selectOnly}
        // selectOnly: typing never commits a value directly -- only clicking a
        // menu option below does, so the field can never end up "stuck" on a
        // partial/unmatched string while the user is still typing to filter.
        onChange={(event) => !selectOnly && (!numeric || /^\d*(?:[.,]\d*)?$/.test(event.target.value)) && onChange(event.target.value)}
        onFocus={(event) => { setOpen(true); event.target.select(); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      <button type="button" className="fixout-combo-toggle" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)}>▾</button>
      {open && <div className="fixout-combo-menu">{options.length ? options.map((option) => (
        <button type="button" key={option} className="fixout-combo-option" onMouseDown={(event) => { event.preventDefault(); onChange(option); setOpen(false); }}>{option}</button>
      )) : <div className="fixout-combo-empty">No matches</div>}</div>}
    </div>
  </label>;
}

export default function BunNswActFixoutForm({ data, sourceFiles, idJobHw = "", onChange }: Props) {
  const lockupDoors = Object.values(sourceFiles).flatMap((file) => parse<LockupDoor[]>(file.fields.lockup_doors, []));
  const [doors, setDoors] = useState<FixoutDoor[]>(() => parse(data.fields.fixout_doors, []));
  const [drafts, setDrafts] = useState<Record<FixoutMode, Draft>>(() => ({ cavity: emptyDraft("cavity"), prehung: emptyDraft("prehung"), "loose-jamb": emptyDraft("loose-jamb") }));
  const [errors, setErrors] = useState<Record<FixoutMode, string>>({ cavity: "", prehung: "", "loose-jamb": "" });
  const [editing, setEditing] = useState<FixoutDoor | null>(null);
  const [doorNames, setDoorNames] = useState<string[]>([]);
  const [trimTypeOptions, setTrimTypeOptions] = useState<Array<[string, string]>>([]);
  const [smartRobeRows, setSmartRobeRows] = useState<SmartRobeRow[]>(() => parse<SmartRobeRow[]>(data.fields.fixout_smart_robe_rows, [])
    // Drop blank placeholder rows and backfill ids left over from an earlier
    // fixed-10-row grid design that predates per-row add/edit.
    .filter((row) => row.label.trim() || row.unitSize.trim() || row.type.trim())
    .map((row) => row.id ? row : { ...row, id: `${Date.now()}-${Math.random().toString(16).slice(2)}` }));
  const [smartRobeDraft, setSmartRobeDraft] = useState<SmartRobeDraft>(emptySmartRobeDraft());
  const [smartRobeError, setSmartRobeError] = useState("");
  const [editingSmartRobe, setEditingSmartRobe] = useState<SmartRobeRow | null>(null);
  const [fingerGrips, setFingerGrips] = useState(() => data.fields.fixout_smart_robe_finger_grips ?? "No");
  const [revealOpenings, setRevealOpenings] = useState<RevealOpening[]>(() => parse<RevealOpening[]>(data.fields.fixout_reveal_openings, []));
  const [revealDraft, setRevealDraft] = useState<RevealDraft>(emptyRevealDraft());
  const [revealError, setRevealError] = useState("");
  const [editingReveal, setEditingReveal] = useState<RevealOpening | null>(null);

  useEffect(() => { getBunNswActLockupOptions().then((result) => setDoorNames(result.internal)).catch(() => undefined); }, []);
  useEffect(() => {
    getUsingFindItems("BUN-NSW-ACT", "fixout").then((rows) => {
      const byKey = new Map(rows.filter((row) => row.group_key === "trim-options").map((row) => [row.usage_key, row]));
      setTrimTypeOptions([
        ["To Match Existing 5.4M", ""],
        ...TRIM_OPTION_DEFINITIONS.filter(([key]) => key !== "match-existing").map(([key, label]) => {
          const usage = byKey.get(`trim-option.${key}`);
          return [label, usage?.item_number ?? ""] as [string, string];
        }),
      ]);
    }).catch(() => undefined);
  }, []);

  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [sourceLoadedFor, setSourceLoadedFor] = useState("");

  useEffect(() => {
    const hwId = idJobHw.trim();
    if (!hwId || sourceLoadedFor === hwId) return;

    let cancelled = false;
    setSourceLoading(true);
    setSourceError("");

    const modeOf = (value: string): FixoutMode => {
      const mode = value.trim().toLowerCase();
      if (mode === "cavity") return "cavity";
      if (mode === "loose" || mode === "loose-jamb" || mode === "loose jamb") return "loose-jamb";
      return "prehung";
    };
    const furnitureOf = (value: string): Furniture => {
      const normalized = value.trim().toLowerCase();
      const allowed: Furniture[] = ["passage", "privacy", "dummy", "privacy-dummy", "passage-dummy", "cavity-passage", "cavity-privacy", "face-door-passage", "face-door-privacy", "none"];
      return allowed.includes(normalized as Furniture) ? normalized as Furniture : "none";
    };
    const stopOf = (value: string): Stop => {
      const normalized = value.trim().toLowerCase();
      return normalized === "cushion" || normalized === "ds2-riser" || normalized === "none"
        ? normalized as Stop
        : "none";
    };
    const frameOf = (value: string): FrameType => {
      return value === "Ezy Jamb" || value === "Steel Frame" ? value : "Timber Jamb";
    };
    const mapRow = (row: EmsFixoutRow): FixoutDoor => ({
      id: row.id,
      mode: modeOf(row.category || ""),
      label: row.door_label || "",
      doorName: row.door_type || "",
      itemNumber: "",
      description: "",
      height: num(row.height),
      width: num(row.width),
      qty: num(row.qty) || 1,
      configuration: "single",
      thickness: row.thicks || "",
      wallWidth: row.wall_width || "",
      frameType: frameOf(row.door_frame || ""),
      liftOff: row.lift_off_pivot || "",
      handing: row.handing || "",
      hole: row.hole || "",
      finish: row.finish || "",
      furniture: furnitureOf(row.door_furniture || ""),
      stop: stopOf(row.door_stop || ""),
    });

    getEmsFixoutRows(hwId)
      .then((result) => {
        if (cancelled) return;
        setDoors((result.rows || []).map(mapRow));
        setSourceLoadedFor(hwId);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSourceError(error instanceof Error ? error.message : "Could not load Fixout source data.");
      })
      .finally(() => {
        if (!cancelled) setSourceLoading(false);
      });

    return () => { cancelled = true; };
  }, [idJobHw, sourceLoadedFor]);


  const fallback: Calculation = {
    jambLm: 0, archLm: 0, jamb92Qty: 0, jamb112Qty: 0, hinges: 0, liftOffLh: 0, liftOffRh: 0,
    revealTotal: 0, revealBlockwork: 0, archExtras: 0, archExtDoors: 0, archRobesCsd: 0, archInt: 0,
    smartRobeRows: [], rows: [], outputRows: [],
  };
  // The backend's "fixout" calculator resolves Smart Robe rows itself (accepts
  // smartRobeRows/fingerGrips in the same payload and folds them into
  // outputRows) -- there is no separate "smart-robe" calculator to call.
  const { result: calculation, status } = useCustomerCalculator<Calculation>(
    "BUN-NSW-ACT", "fixout", { doors, fields: data.fields, revealOpenings, lockupDoors, smartRobeRows, fingerGrips }, fallback,
  );

  useEffect(() => {
    // Persist the door list (reveal openings, Smart Robe rows/finger grips) as
    // soon as they change, independent of the debounced calculator round-trip
    // below -- otherwise switching tabs before the calc resolves discards
    // whatever was just added (it never reaches data.fields).
    const doorsJson = JSON.stringify(doors);
    const revealJson = JSON.stringify(revealOpenings);
    const smartRobeJson = JSON.stringify(smartRobeRows);
    const doorsChanged = data.fields.fixout_doors !== doorsJson;
    const revealChanged = data.fields.fixout_reveal_openings !== revealJson;
    const smartRobeChanged = data.fields.fixout_smart_robe_rows !== smartRobeJson;
    const gripsChanged = (data.fields.fixout_smart_robe_finger_grips ?? "No") !== fingerGrips;
    const fields = (doorsChanged || revealChanged || smartRobeChanged || gripsChanged)
      ? {
        ...data.fields,
        ...(doorsChanged ? { fixout_doors: doorsJson } : {}),
        ...(revealChanged ? { fixout_reveal_openings: revealJson } : {}),
        ...(smartRobeChanged ? { fixout_smart_robe_rows: smartRobeJson } : {}),
        ...(gripsChanged ? { fixout_smart_robe_finger_grips: fingerGrips } : {}),
      }
      : data.fields;
    let rows = data.rows;
    if (status === "ok") {
      // Smart Robe rows are tagged "Fixout Smart Robe | ..." by the backend, so
      // this one prefix check already recognises both regular Fixout rows and
      // Smart Robe rows as generated (not manual).
      const manual = data.rows.filter((row) => !String(row.comments || "").startsWith("Fixout"));
      const nextRows = [...calculation.outputRows, ...manual];
      if (JSON.stringify(nextRows) !== JSON.stringify(data.rows)) rows = nextRows;
    }
    if (!doorsChanged && !revealChanged && !smartRobeChanged && !gripsChanged && rows === data.rows) return;
    onChange({ ...data, fields, rows });
  }, [calculation.outputRows, data, doors, revealOpenings, smartRobeRows, fingerGrips, onChange, status]);

  // Smart Robe rows for the preview table below the entered-robe-doors table --
  // the same rows already folded into calculation.outputRows, filtered back out
  // by their "Fixout Smart Robe | ..." tag.
  const smartRobePreviewRows = calculation.outputRows.filter((row) => String(row.comments || "").startsWith("Fixout Smart Robe"));

  const updateDraft = (mode: FixoutMode, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [mode]: { ...current[mode], ...patch } }));
    setErrors((current) => ({ ...current, [mode]: "" }));
  };

  const smartRobeWidths = SMART_ROBE_WIDTH_TABLE.map(([grips, noGrips]) => fingerGrips === "Yes" ? grips : noGrips);

  const addSmartRobeRow = () => {
    if (!smartRobeDraft.label.trim() || !smartRobeDraft.unitSize.trim() || !smartRobeDraft.type.trim()) {
      setSmartRobeError("Enter label, unit size and type.");
      return;
    }
    setSmartRobeRows((current) => [...current, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ...smartRobeDraft }]);
    setSmartRobeDraft(emptySmartRobeDraft());
    setSmartRobeError("");
  };
  const saveSmartRobeRow = () => {
    if (!editingSmartRobe) return;
    setSmartRobeRows((current) => current.map((row) => row.id === editingSmartRobe.id ? editingSmartRobe : row));
    setEditingSmartRobe(null);
  };
  const removeSmartRobeRow = (row: SmartRobeRow) => {
    if (!window.confirm(`Delete ${row.label || "this entry"}?`)) return;
    setSmartRobeRows((current) => current.filter((item) => item.id !== row.id));
    if (editingSmartRobe?.id === row.id) setEditingSmartRobe(null);
  };

  const addRevealOpening = () => {
    if (!num(revealDraft.height) || !num(revealDraft.width)) {
      setRevealError("Enter height and width.");
      return;
    }
    setRevealOpenings((current) => [...current, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ...revealDraft }]);
    setRevealDraft(emptyRevealDraft());
    setRevealError("");
  };
  const saveRevealOpening = () => {
    if (!editingReveal) return;
    setRevealOpenings((current) => current.map((row) => row.id === editingReveal.id ? editingReveal : row));
    setEditingReveal(null);
  };
  const removeRevealOpening = (row: RevealOpening) => {
    if (!window.confirm(`Delete this ${row.type} opening?`)) return;
    setRevealOpenings((current) => current.filter((item) => item.id !== row.id));
    if (editingReveal?.id === row.id) setEditingReveal(null);
  };

  const add = (mode: FixoutMode) => {
    const draft = drafts[mode];
    const height = num(draft.height);
    const width = num(draft.width);
    const wallWidth = draft.wallWidth;
    const qty = num(draft.qty);
    if (!draft.label.trim() || !draft.doorName.trim() || !height || !width || !qty) {
      setErrors((current) => ({ ...current, [mode]: "Enter label, door type, height, width and quantity." }));
      return;
    }
    setDoors((current) => [...current, {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, mode, label: draft.label.trim(), doorName: draft.doorName.trim(),
      itemNumber: "", description: "", height, width, qty, configuration: draft.configuration, thickness: draft.thickness,
      wallWidth, frameType: draft.frameType, liftOff: draft.liftOff, handing: draft.handing, hole: draft.hole, finish: draft.finish,
      furniture: draft.furniture, stop: draft.stop,
    }]);
    setDrafts((current) => ({ ...current, [mode]: emptyDraft(mode) }));
  };

  const save = () => {
    if (!editing) return;
    setDoors((current) => current.map((door) => door.id === editing.id ? { ...editing, height: num(editing.height), width: num(editing.width), qty: num(editing.qty) } : door));
    setEditing(null);
  };
  const remove = (door: FixoutDoor) => {
    if (!window.confirm(`Delete ${door.label || "this door"}?`)) return;
    setDoors((current) => current.filter((item) => item.id !== door.id));
    if (editing?.id === door.id) setEditing(null);
  };
  const update = (key: string, value: string) => onChange({ ...data, fields: { ...data.fields, [key]: value } });
  const updateMany = (patch: Record<string, string>) => onChange({ ...data, fields: { ...data.fields, ...patch } });

  const renderModeGroup = (mode: FixoutMode, title: string) => {
    const draft = drafts[mode];
    return <CollapsibleSubgroup title={title} className="fixout-mode-group">
      <div className="fixout-form-grid fixout-mode-form-grid">
        <ComboField label="Door label" value={draft.label} values={ROOM_LABELS} filter onChange={(label) => updateDraft(mode, { label, ...roomSuggestionPatch(mode, label, draft.handing) })}/>
        <ComboField label="Height (mm)" value={draft.height} values={options.height} numeric onChange={(height) => updateDraft(mode, { height })}/>
        <ComboField label={mode === "cavity" ? "Door Size (mm)" : "Width (mm)"} value={draft.width} values={mode === "cavity" ? options.cavityWidth : options.width} numeric onChange={(width) => updateDraft(mode, { width })}/>
        <label className="fh-field"><span>{mode === "cavity" ? "Qty" : "QTY"}</span><input className="fh-required" value={draft.qty} onChange={(event) => /^\d*(?:[.,]\d*)?$/.test(event.target.value) && updateDraft(mode, { qty: event.target.value })}/></label>
        {/* Fixout!N9 "Wall Width" (Cavity table) vs Fixout!P22:P60 "Jamb or Wall
            for Steel Frame" (Internal Doors Room table) -- same 70/90 data, two
            different column names depending on which Excel table it's from. */}
        <ComboField label={mode === "cavity" ? "Wall Width" : "Jamb or Wall for Steel Frame"} value={draft.wallWidth} values={["70", "90"]} onChange={(wallWidth) => updateDraft(mode, { wallWidth })}/>
        {/* Fixout!O9 "Door Type" (Cavity Sliding Units table) vs Fixout!Q21 "Type" (Internal Doors Room table) -- same field, different label per Excel table. */}
        <ComboField className="fixout-description" label={mode === "cavity" ? "Door Type" : "Type"} value={draft.doorName} values={doorNames} filter onChange={(doorName) => updateDraft(mode, { doorName })}/>
        {/* Fixout!R10:R19 / R22:R60 ("Thicks") x14 extended data validation list -> 'Lock Up'!N2:N4 = [35, 40, 38]. */}
        <SelectField label="Thicks" value={draft.thickness} values={["35", "38", "40"]} onChange={(thickness) => updateDraft(mode, { thickness })}/>
        {mode === "cavity" && (
          // Fixout!S9 "EzyJamb" (Cavity Sliding Units table) is a plain Yes/No
          // flag, not the 3-way Frame selector used by the Internal Doors tables.
          <SelectField label="EzyJamb" value={draft.frameType === "Ezy Jamb" ? "Yes" : "No"} values={["No", "Yes"]} onChange={(value) => updateDraft(mode, { frameType: (value === "Yes" ? "Ezy Jamb" : "Timber Jamb") as FrameType })}/>
        )}
        {mode === "cavity" && <SelectField label="Unit Type" value={draft.configuration} values={["single", "double"]} onChange={(configuration) => updateDraft(mode, { configuration: configuration as Draft["configuration"] })}/>}
        {/* Fixout!S21 "Lift Off / Pivot Frame" only applies to Loose Jamb doors. */}
        {mode === "loose-jamb" && <SelectField label="Lift Off / Pivot Frame" value={draft.liftOff} values={options.liftOff} onChange={(liftOff) => updateDraft(mode, { liftOff })}/>}
        {mode !== "cavity" && <SelectField label="Door Frame" value={draft.frameType} values={options.frame} onChange={(frameType) => updateDraft(mode, { frameType: frameType as FrameType })}/>}
        {mode !== "cavity" && <SelectField label="Door Stop" value={draft.stop} values={STOP_OPTIONS} labels={STOP_LABELS} onChange={(stop) => updateDraft(mode, { stop: stop as Stop })}/>}
        <SelectField
          label="Door Furniture"
          value={draft.furniture}
          values={FURNITURE_OPTIONS[mode]}
          labels={FURNITURE_LABELS}
          onChange={(furniture) => updateDraft(mode, { furniture: furniture as Furniture })}
        />
        {/* Fixout!X21 "Hole", Y21 "Handing", Z21 "Finish" only apply to Prehung doors. */}
        {mode === "prehung" && <SelectField label="Hole" value={draft.hole} values={options.hole} onChange={(hole) => updateDraft(mode, { hole })}/>}
        {mode === "prehung" && <SelectField label="Handing" value={draft.handing} values={options.handing} onChange={(handing) => updateDraft(mode, { handing, ...roomSuggestionPatch(mode, draft.label, handing) })}/>}
        {mode === "prehung" && <SelectField label="Finish" value={draft.finish} values={options.finish} onChange={(finish) => updateDraft(mode, { finish })}/>}
        <button className="fh-add-wall" type="button" onClick={() => add(mode)}>+ Add door</button>
      </div>
      <div className={errors[mode] ? "fh-hint error" : "fh-hint"}>{errors[mode] || "Door and material codes are looked up automatically from the Bunnings workbook."}</div>
    </CollapsibleSubgroup>;
  };

  return <div className="fh-module fixout-module">
    <datalist id="fixout-door-names">{doorNames.map((name) => <option key={name} value={name}/>)}</datalist>
    <datalist id="fixout-room-labels">{ROOM_LABELS.map((name) => <option key={name} value={name}/>)}</datalist>
    <header className="module-heading fh-title-row"><div><h1>Fixout</h1><p>Cavity sliders, internal doors, jambs, hinges and trims calculated from the Bunnings workbook rules.</p></div></header>

    <section className="fh-card"><div className="fh-card-title">1. Door information</div><div className="collapsible-subgroup-stack fixout-input-groups">
      {renderModeGroup("cavity", "Cavity Sliding Door")}
      {renderModeGroup("prehung", "Internal prehung doors")}
      {renderModeGroup("loose-jamb", "Internal loose-jamb doors")}
    </div></section>

    <section className="fh-card fixout-entered-card">
      <div className="fh-card-title"><span>2. Entered doors</span></div>
      <div className="fh-table-wrap fixout-door-table-wrap"><table className="fh-table fixout-door-table"><thead><tr>
        <th>#</th><th>Category</th><th>Door label</th><th>Type</th><th>Height</th><th>Width</th>
        <th>Thicks</th><th>Wall width</th><th>Door Frame</th><th>Lift Off / Pivot Frame</th><th>Handing</th>
        <th>Hole</th><th>Finish</th><th>Door Furniture</th><th>Door Stop</th><th>QTY</th><th></th>
      </tr></thead><tbody>{doors.map((door, index) => {
        const rowEditing = editing?.id === door.id, current = rowEditing && editing ? editing : door;
        const isCavity = door.mode === "cavity";
        return <tr key={door.id} className={rowEditing ? "ui-editing-row" : ""}>
          <td>{index + 1}</td>
          <td>{modeLabel(door.mode)}</td>
          <td>{rowEditing ? <input list="fixout-room-labels" value={current.label} onChange={(event) => setEditing({ ...current, label: event.target.value })}/> : door.label}</td>
          <td>{rowEditing ? <input list="fixout-door-names" value={current.doorName || ""} onChange={(event) => setEditing({ ...current, doorName: event.target.value })}/> : (door.doorName || door.description)}</td>
          <td>{rowEditing ? <input value={current.height} onChange={(event) => setEditing({ ...current, height: num(event.target.value) })}/> : door.height}</td>
          <td>{rowEditing ? <input value={current.width} onChange={(event) => setEditing({ ...current, width: num(event.target.value) })}/> : door.width}</td>
          <td>{rowEditing ? <input value={current.thickness || ""} onChange={(event) => setEditing({ ...current, thickness: event.target.value })}/> : (door.thickness || "—")}</td>
          <td>{rowEditing ? <input value={current.wallWidth || "90"} onChange={(event) => setEditing({ ...current, wallWidth: event.target.value })}/> : (door.wallWidth || "90")}</td>
          <td>{rowEditing ? (
            isCavity
              ? <select value={current.frameType === "Ezy Jamb" ? "Yes" : "No"} onChange={(event) => setEditing({ ...current, frameType: (event.target.value === "Yes" ? "Ezy Jamb" : "Timber Jamb") as FrameType })}><option>No</option><option>Yes</option></select>
              : <select value={current.frameType || "Timber Jamb"} onChange={(event) => setEditing({ ...current, frameType: event.target.value as FrameType })}>{options.frame.map((value) => <option key={value}>{value}</option>)}</select>
          ) : (isCavity ? (door.frameType === "Ezy Jamb" ? "EzyJamb: Yes" : "EzyJamb: No") : (door.frameType || "Timber Jamb"))}</td>
          <td>{rowEditing ? (door.mode !== "loose-jamb" ? "—" : <select value={current.liftOff || ""} onChange={(event) => setEditing({ ...current, liftOff: event.target.value })}>{options.liftOff.map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}</select>) : (door.mode !== "loose-jamb" ? "—" : (door.liftOff || "—"))}</td>
          <td>{rowEditing ? (door.mode !== "prehung" ? "—" : <select value={current.handing || ""} onChange={(event) => setEditing({ ...current, handing: event.target.value })}>{options.handing.map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}</select>) : (door.mode !== "prehung" ? "—" : (door.handing || "—"))}</td>
          <td>{rowEditing ? (door.mode !== "prehung" ? "—" : <select value={current.hole || ""} onChange={(event) => setEditing({ ...current, hole: event.target.value })}>{options.hole.map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}</select>) : (door.mode !== "prehung" ? "—" : (door.hole || "—"))}</td>
          <td>{rowEditing ? (door.mode !== "prehung" ? "—" : <select value={current.finish || ""} onChange={(event) => setEditing({ ...current, finish: event.target.value })}>{options.finish.map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}</select>) : (door.mode !== "prehung" ? "—" : (door.finish || "—"))}</td>
          <td>{rowEditing ? <select value={current.furniture} onChange={(event) => setEditing({ ...current, furniture: event.target.value as Furniture })}>{FURNITURE_OPTIONS[door.mode || "prehung"].map((value) => <option key={value} value={value}>{FURNITURE_LABELS[value] || capitalize(value)}</option>)}</select> : (FURNITURE_LABELS[door.furniture] || capitalize(door.furniture))}</td>
          <td>{rowEditing ? (isCavity ? "—" : <select value={current.stop} onChange={(event) => setEditing({ ...current, stop: event.target.value as Stop })}>{STOP_OPTIONS.map((value) => <option key={value} value={value}>{STOP_LABELS[value] || capitalize(value)}</option>)}</select>) : (isCavity ? "—" : (STOP_LABELS[door.stop] || capitalize(door.stop)))}</td>
          <td className="fh-number">{rowEditing ? <input value={current.qty} onChange={(event) => setEditing({ ...current, qty: num(event.target.value) })}/> : fmt(door.qty)}</td>
          <td><div className="ui-row-actions">{rowEditing ? <><button className="ui-row-save" type="button" onClick={save}>Save</button><button className="ui-row-cancel" type="button" onClick={() => setEditing(null)}>×</button></> : <><button className="ui-row-edit" type="button" onClick={() => setEditing({ ...door })}>Edit</button><button className="fh-remove" type="button" aria-label={`Delete ${door.label}`} onClick={() => remove(door)}>×</button></>}</div></td>
        </tr>;
      })}</tbody></table>{!doors.length && <div className="fh-empty">No Fixout doors entered.</div>}</div>
    </section>

    <section className="fh-card">
      <div className="fh-card-title fixout-smart-robe-title">
        <span>3. Smart Robe Door</span>
        <SelectField label="Finger Grips" value={fingerGrips} values={["No", "Yes"]} onChange={setFingerGrips}/>
      </div>
      <div className="fixout-form-grid fixout-mode-form-grid">
        <ComboField label="Label" value={smartRobeDraft.label} values={ROOM_LABELS} filter onChange={(label) => setSmartRobeDraft((current) => ({ ...current, label }))}/>
        <SelectField label="Unit Height" value={smartRobeDraft.unitHeight} values={["2340", "2040"]} onChange={(unitHeight) => setSmartRobeDraft((current) => ({ ...current, unitHeight }))}/>
        <ComboField label="Unit Size" value={smartRobeDraft.unitSize} values={smartRobeWidths} numeric onChange={(unitSize) => setSmartRobeDraft((current) => ({ ...current, unitSize }))}/>
        <SelectField label="Wall" value={smartRobeDraft.wall} values={["90", "70"]} onChange={(wall) => setSmartRobeDraft((current) => ({ ...current, wall }))}/>
        <ComboField className="fixout-description" label="Type" value={smartRobeDraft.type} values={doorNames} filter onChange={(type) => setSmartRobeDraft((current) => ({ ...current, type }))}/>
        <label className="fh-field"><span>Thicks</span><input className="fh-required" value={smartRobeDraft.thicks} onChange={(event) => /^\d*(?:[.,]\d*)?$/.test(event.target.value) && setSmartRobeDraft((current) => ({ ...current, thicks: event.target.value }))}/></label>
        <button className="fh-add-wall" type="button" onClick={addSmartRobeRow}>+ Add robe door</button>
      </div>
      <div className={smartRobeError ? "fh-hint error" : "fh-hint"}>{smartRobeError || "Unit Size must match a preset door-leaf configuration; the auto schedule below shows the resolved unit/door description."}</div>
    </section>

    <section className="fh-card fixout-entered-card">
      <div className="fh-card-title"><span>Entered robe door</span></div>
      <div className="fh-table-wrap fixout-smart-robe-table-wrap"><table className="fh-table fixout-smart-robe-table"><thead><tr>
        <th>#</th><th>Label</th><th>Unit Height</th><th>Unit Size</th><th>Wall</th><th>Type</th><th>Thicks</th><th></th>
      </tr></thead><tbody>{smartRobeRows.map((row, index) => {
        const rowEditing = editingSmartRobe?.id === row.id, current = rowEditing && editingSmartRobe ? editingSmartRobe : row;
        return <tr key={row.id} className={rowEditing ? "ui-editing-row" : ""}>
          <td>{index + 1}</td>
          <td>{rowEditing ? <input list="fixout-room-labels" value={current.label} onChange={(event) => setEditingSmartRobe({ ...current, label: event.target.value })}/> : row.label}</td>
          <td>{rowEditing ? <select value={current.unitHeight} onChange={(event) => setEditingSmartRobe({ ...current, unitHeight: event.target.value })}><option value="2340">2340</option><option value="2040">2040</option></select> : row.unitHeight}</td>
          <td>{rowEditing ? <input value={current.unitSize} onChange={(event) => setEditingSmartRobe({ ...current, unitSize: event.target.value })}/> : row.unitSize}</td>
          <td>{rowEditing ? <select value={current.wall} onChange={(event) => setEditingSmartRobe({ ...current, wall: event.target.value })}><option value="90">90</option><option value="70">70</option></select> : row.wall}</td>
          <td>{rowEditing ? <input list="fixout-door-names" value={current.type} onChange={(event) => setEditingSmartRobe({ ...current, type: event.target.value })}/> : row.type}</td>
          <td>{rowEditing ? <input value={current.thicks} onChange={(event) => setEditingSmartRobe({ ...current, thicks: event.target.value })}/> : row.thicks}</td>
          <td><div className="ui-row-actions">{rowEditing ? <><button className="ui-row-save" type="button" onClick={saveSmartRobeRow}>Save</button><button className="ui-row-cancel" type="button" onClick={() => setEditingSmartRobe(null)}>×</button></> : <><button className="ui-row-edit" type="button" onClick={() => setEditingSmartRobe({ ...row })}>Edit</button><button className="fh-remove" type="button" aria-label={`Delete ${row.label}`} onClick={() => removeSmartRobeRow(row)}>×</button></>}</div></td>
        </tr>;
      })}</tbody></table>{!smartRobeRows.length && <div className="fh-empty">No robe doors entered.</div>}</div>
      {smartRobePreviewRows.length > 0 && <div className="fh-table-wrap"><table className="fh-table fh-output-table"><thead><tr><th>Description</th><th>Quantity</th><th>Unit</th></tr></thead><tbody>{smartRobePreviewRows.map((row, index) => <tr key={index}><td>{row.description}</td><td>{fmt(num(row.qty))}</td><td>{row.unit}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="fh-card"><div className="fh-card-title">4. Additional trim measurements</div>
    <div className="fixout-trim-groups">
      <div className="fixout-trim-subgroup">
        <div className="fixout-trim-subgroup-title">Reveals</div>
        <div className="fixout-form-grid fixout-mode-form-grid">
          <SelectField label="Type" value={revealDraft.type} values={["window", "door"]} onChange={(type) => setRevealDraft((current) => ({ ...current, type: type as RevealOpeningType }))}/>
          <label className="fh-field"><span>Height</span><input className="fh-required" value={revealDraft.height} onChange={(event) => /^\d*$/.test(event.target.value) && setRevealDraft((current) => ({ ...current, height: event.target.value }))}/></label>
          <label className="fh-field"><span>Width</span><input className="fh-required" value={revealDraft.width} onChange={(event) => /^\d*$/.test(event.target.value) && setRevealDraft((current) => ({ ...current, width: event.target.value }))}/></label>
          <SelectField label="Block Work" value={revealDraft.blockWork} values={["No", "Yes"]} onChange={(blockWork) => setRevealDraft((current) => ({ ...current, blockWork }))}/>
          <button className="fh-add-wall" type="button" onClick={addRevealOpening}>+ Add opening</button>
        </div>
        {revealError && <div className="fh-hint error">{revealError}</div>}
        <div className="fh-table-wrap"><table className="fh-table fixout-reveal-table"><thead><tr>
          <th>#</th><th>Type</th><th>Height</th><th>Width</th><th>Block Work</th><th></th>
        </tr></thead><tbody>{revealOpenings.map((row, index) => {
          const rowEditing = editingReveal?.id === row.id, current = rowEditing && editingReveal ? editingReveal : row;
          return <tr key={row.id} className={rowEditing ? "ui-editing-row" : ""}>
            <td>{index + 1}</td>
            <td>{rowEditing ? <select value={current.type} onChange={(event) => setEditingReveal({ ...current, type: event.target.value as RevealOpeningType })}><option value="window">Window</option><option value="door">Door</option></select> : capitalize(row.type)}</td>
            <td>{rowEditing ? <input value={current.height} onChange={(event) => setEditingReveal({ ...current, height: event.target.value })}/> : row.height}</td>
            <td>{rowEditing ? <input value={current.width} onChange={(event) => setEditingReveal({ ...current, width: event.target.value })}/> : row.width}</td>
            <td>{rowEditing ? <select value={current.blockWork} onChange={(event) => setEditingReveal({ ...current, blockWork: event.target.value })}><option value="No">No</option><option value="Yes">Yes</option></select> : row.blockWork}</td>
            <td><div className="ui-row-actions">{rowEditing ? <><button className="ui-row-save" type="button" onClick={saveRevealOpening}>Save</button><button className="ui-row-cancel" type="button" onClick={() => setEditingReveal(null)}>×</button></> : <><button className="ui-row-edit" type="button" onClick={() => setEditingReveal({ ...row })}>Edit</button><button className="fh-remove" type="button" aria-label="Delete opening" onClick={() => removeRevealOpening(row)}>×</button></>}</div></td>
          </tr>;
        })}</tbody></table>{!revealOpenings.length && <div className="fh-empty">No window/door openings entered.</div>}</div>
      </div>

      <div className="fixout-trim-subgroup">
        <div className="fixout-trim-subgroup-title">Architrave</div>
        <div className="fixout-extra-grid fixout-extra-grid-compact">
          <label className="fh-field"><span>Extras architrave</span><input className="fh-required" value={data.fields.fixout_arch_extra_lengths ?? "0"} onChange={(event) => /^\d*(?:[.,]\d*)?$/.test(event.target.value) && update("fixout_arch_extra_lengths", event.target.value)}/></label>
          {/* Fixout!M70 "Type" x14 extended data validation -> Fix!B127:C153. */}
          <TrimTypeField label="Architrave Type" itemKey="arch" defaultOptionKey="mdf-dar-42x18" options={trimTypeOptions} fields={data.fields} onChange={updateMany}/>
        </div>
        <div className="fh-table-wrap"><table className="fh-table fixout-arch-breakdown-table"><thead><tr>
          <th>Extras</th><th>Ext Doors</th><th>Robes +CSD</th><th>Windows</th><th>Int</th>
        </tr></thead><tbody><tr>
          <td>{fmt(calculation.archExtras)}</td>
          <td>{fmt(calculation.archExtDoors)}</td>
          <td>{fmt(calculation.archRobesCsd)}</td>
          <td>{fmt(calculation.revealTotal)}</td>
          <td>{fmt(calculation.archInt)}</td>
        </tr></tbody></table></div>
      </div>

      <div className="fixout-trim-subgroup">
        <div className="fixout-trim-subgroup-title">Skirting</div>
        <div className="fixout-extra-grid fixout-extra-grid-compact">
          <label className="fh-field"><span>Skirting</span><input className="fh-required" value={data.fields.fixout_skirting_lm ?? "0"} onChange={(event) => /^\d*(?:[.,]\d*)?$/.test(event.target.value) && update("fixout_skirting_lm", event.target.value)}/></label>
          {/* Fixout!M73 "Type" x14 extended data validation -> Fix!B127:C153. */}
          <TrimTypeField label="Skirting Type" itemKey="skirting" defaultOptionKey="mdf-dar-67x18" options={trimTypeOptions} fields={data.fields} onChange={updateMany}/>
        </div>
      </div>

      <div className="fixout-trim-subgroup">
        <div className="fixout-trim-subgroup-title">Robe &amp; Linen</div>
        <div className="fixout-extra-grid fixout-extra-grid-compact">
          <label className="fh-field"><span>Robe Count</span><input className="fh-required" value={data.fields.fixout_robe_count ?? "0"} onChange={(event) => /^\d*(?:[.,]\d*)?$/.test(event.target.value) && update("fixout_robe_count", event.target.value)}/></label>
          <SelectField label="Robe/Linen jamb size" value={data.fields.fixout_robe_jamb_size ?? "112x19"} values={["112x19", "92x19"]} onChange={(value) => update("fixout_robe_jamb_size", value)}/>
        </div>
      </div>

      <div className="fixout-trim-subgroup">
        <div className="fixout-trim-subgroup-title">Wet Areas</div>
        <div className="fixout-extra-grid fixout-extra-grid-compact">
          <label className="fh-field"><span>Wet-area architrave</span><input className="fh-required" value={data.fields.fixout_wet_arch_lengths ?? "0"} onChange={(event) => /^\d*(?:[.,]\d*)?$/.test(event.target.value) && update("fixout_wet_arch_lengths", event.target.value)}/></label>
          {/* Fixout!M80 "Type" x14 extended data validation -> Fix!B127:C153. */}
          <TrimTypeField label="Wet-area Architrave Type" itemKey="arch-wet" defaultOptionKey="mdf-dar-42x18" options={trimTypeOptions} fields={data.fields} onChange={updateMany}/>
          <label className="fh-field"><span>Wet-area skirting</span><input className="fh-required" value={data.fields.fixout_wet_skirting_lm ?? "0"} onChange={(event) => /^\d*(?:[.,]\d*)?$/.test(event.target.value) && update("fixout_wet_skirting_lm", event.target.value)}/></label>
          {/* Fixout!M83 "Type" x14 extended data validation -> Fix!B127:C153. */}
          <TrimTypeField label="Wet-area Skirting Type" itemKey="skirting-wet" defaultOptionKey="mdf-dar-67x18" options={trimTypeOptions} fields={data.fields} onChange={updateMany}/>
        </div>
      </div>
    </div>
    </section>

    <section className="fh-card"><div className="fh-card-title">5. Automatic Fixout schedule</div>
      <div className="fh-summary"><div className="fh-kpi"><strong>{fmt(calculation.jamb112Qty)}</strong><span>112mm jambs</span></div><div className="fh-kpi"><strong>{fmt(calculation.jamb92Qty)}</strong><span>92mm jambs</span></div><div className="fh-kpi"><strong>{fmt(calculation.hinges + calculation.liftOffLh + calculation.liftOffRh)}</strong><span>Total hinges</span></div><div className="fh-kpi"><strong>{fmt(doors.reduce((sum, door) => sum + door.qty, 0))}</strong><span>Total doors</span></div></div>
      <div className="fh-table-wrap"><table className="fh-table fh-output-table"><thead><tr><th>Description</th><th>Quantity</th><th>Unit</th><th>Code</th></tr></thead><tbody>{calculation.outputRows.filter((row) => num(row.qty) > 0).map((row, index) => <tr key={index}><td>{row.description}</td><td>{fmt(num(row.qty))}</td><td>{row.unit}</td><td>{row.item_number || "—"}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
