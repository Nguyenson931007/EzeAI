import "../styles/LockupForm.css";
import { useEffect, useRef, useState } from "react";
import { publishAiImportStatus } from "../../../ui/aiImportStatus";
import { SearchDropdown } from "../../../ui/SharedFormControls";
import { getBunNswActLockupOptions, getEmsLockOut } from "../../../api";
import type { WorkflowOutputRow, WorkPackFileData } from "../../../types";
import { useCustomerCalculator } from "../../useCustomerCalculator";
import CollapsibleSubgroup from "../../../components/CollapsibleSubgroup";
import ScheduleLoadingRow from "../../../components/ScheduleLoadingRow";
import {
  LOCKUP_DOOR_STOPS,
  LOCKUP_HEIGHTS,
  LOCKUP_HUNG,
  LOCKUP_THICKNESSES,
  LOCKUP_TYPES,
  LOCKUP_WIDTHS,
  LOOSE_JAMB_DOOR_NAMES,
  LOOSE_JAMBS,
  PREHUNG_DOOR_NAMES,
} from "../support/lockupOptions";
import { formatInputNumber as format, nonNegativeNumber as numberValue } from "../support/normalization";

type DoorMode = "prehung" | "loose-jamb";
type DoorScope = "external" | "internal";
type Furniture = "entry" | "privacy" | "dummy" | "none";
type Door = {
  id: string;
  sourceId?: string;
  mode?: DoorMode;
  scope?: DoorScope;
  label: string;
  doorName?: string;
  itemNumber: string;
  description: string;
  height: number;
  width: number;
  thickness?: string;
  jamb?: string;
  jambOrWall?: string;
  hung?: string;
  doorType?: string;
  doorStop?: string;
  internalType?: "HF" | "HO";
  color?: "CHR" | "SCH";
  qty: number;
  frame: "timber" | "steel";
  configuration: "single" | "double";
  weatherstrip: boolean;
  furniture: Furniture;
};
type Props = { data: WorkPackFileData; onChange: (data: WorkPackFileData) => void; sheetId: string; clientShortName: string; jobId: string };
type Draft = {
  label: string; doorName: string; height: string; customHeight: string; width: string; customWidth: string;
  thickness: string; jamb: string; jambOrWall: string; qty: string; hung: string; doorType: string; doorStop: string; internalType: "HF" | "HO"; color: "CHR" | "SCH";
};

const parse = <T,>(value: string | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const suggestedInternalType = (label: string, hung: string): Draft["internalType"] =>
  /linen|robe|closet|pantry|store|storage|cupboard/i.test(label) || /double|triple/i.test(`${label} ${hung}`) ? "HO" : "HF";
const newDraft = (mode: DoorMode): Draft => ({
  label: "", doorName: "", height: "2040", customHeight: "", width: "820", customWidth: "", thickness: mode === "prehung" ? "35" : "38",
  jamb: LOOSE_JAMBS[0], jambOrWall: "", qty: "1", hung: LOCKUP_HUNG[0], doorType: LOCKUP_TYPES[0], doorStop: LOCKUP_DOOR_STOPS[0], internalType: "HF", color: "CHR",
});

export function isBunNswActLockup(sheet = "", name = "", id = "") {
  return [sheet, name, id].some((value) => ["lock up", "lockup", "lock-up"].includes(value.trim().toLowerCase()));
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="fh-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

export default function BunNswActLockupForm({ data, onChange, sheetId, clientShortName, jobId }: Props) {
  const [doors, setDoors] = useState<Door[]>(() => parse(data.fields.lockup_doors, []));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => ({
    "prehung-external": newDraft("prehung"),
    "prehung-internal": newDraft("prehung"),
    "loose-jamb-external": newDraft("loose-jamb"),
    "loose-jamb-internal": newDraft("loose-jamb"),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editingDoor, setEditingDoor] = useState<Door | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceMessage, setSourceMessage] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [workbookDoorNames, setWorkbookDoorNames] = useState<{ internal: string[]; external: string[] }>({ internal: [], external: [] });

  // Parent WorkPack state changes on every draft edit. Keep the latest values in
  // refs so calculator/import effects do not re-run only because the parent
  // created a new `data` object or `onChange` callback during render.
  const latestDataRef = useRef(data);
  const latestDoorsRef = useRef(doors);
  const latestOnChangeRef = useRef(onChange);
  const generatedRowIdentitiesRef = useRef<Set<string>>(new Set());
  latestDoorsRef.current = doors;

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

  const persistDoors = (nextDoors: Door[]) => {
    const currentData = latestDataRef.current;
    latestOnChangeRef.current({
      ...currentData,
      fields: { ...currentData.fields, lockup_doors: JSON.stringify(nextDoors) },
    });
  };

  useEffect(() => {
    getBunNswActLockupOptions().then(setWorkbookDoorNames).catch(() => undefined);
  }, []);


  useEffect(() => {
    const handleAddData = async (event: Event) => {
      const detail = (event as CustomEvent<{ sheetId?: string }>).detail;
      if (detail?.sheetId !== sheetId) return;
      if (!jobId || clientShortName !== "BUN-NSW-ACT") {
        publishAiImportStatus({ sheetId, status: "error", message: "Select a BUN NSW/ACT job before adding AI data." });
        setSourceError("Select a BUN NSW/ACT job before adding AI data.");
        setSourceMessage("");
        return;
      }

      publishAiImportStatus({ sheetId, status: "loading", message: "Loading Lockup data..." });
      setSourceLoading(true);
      setSourceError("");
      setSourceMessage("");
      try {
        const rows = await getEmsLockOut(clientShortName, jobId);
        let skipped = 0;
        const currentDoors = latestDoorsRef.current;
        const existing = new Set(currentDoors.map((door) => door.sourceId).filter(Boolean));
        const imported: Door[] = [];

        rows.forEach((row) => {
          if (existing.has(row.id)) return;
            const modeText = (row.mode ?? "").trim().toLowerCase();
            const scopeText = (row.scope ?? "").trim().toLowerCase();
            const mode: DoorMode | null = modeText.includes("loose") ? "loose-jamb" : modeText.includes("prehung") ? "prehung" : null;
            const scope: DoorScope | null = scopeText === "internal" || scopeText === "external" ? scopeText : null;
            const height = Number(row.height ?? 0);
            const width = Number(row.width ?? 0);
            const qty = Number(row.default_qty ?? 0);
            if (
              !mode ||
              !scope ||
              !height ||
              !width ||
              !qty ||
              (mode === "prehung" && !row.type)
            ) {
              skipped += 1;
              return;
            }

            const jambOrWall = row.jamb_or_wall ?? "";
            const jamb = row.jamb_size ?? undefined;
            const doorType = row.door_type ?? undefined;
            const hung = row.hung ?? undefined;
            const steel = /steel/i.test(`${jambOrWall} ${jamb ?? ""} ${doorType ?? ""}`);
            const internalType = scope === "internal" && (row.internal_type === "HF" || row.internal_type === "HO") ? row.internal_type : undefined;
            const color = scope === "internal" && (row.color === "CHR" || row.color === "SCH") ? row.color : undefined;
            const label = row.label ?? "";
            const category = scope === "internal" ? "DOOR INT" : "DOOR EXT FLUSH";
            const description = [category, `${height}X${width}`, row.type, label, mode === "prehung" ? hung : "", internalType, color].filter(Boolean).join(" ++ ");

          imported.push({
            id: `ems-lockout-${row.id}`, sourceId: row.id, mode, scope, label, doorName: row.type ?? "",
            itemNumber: "", description, height, width, thickness: row.thickness == null ? undefined : String(row.thickness),
            jamb: mode === "loose-jamb" ? jamb : undefined, jambOrWall, hung: mode === "prehung" ? hung : undefined,
            doorType: mode === "prehung" ? doorType : undefined, doorStop: row.door_stop ?? undefined, qty,
            frame: steel ? "steel" : "timber", internalType, color,
            configuration: /double/i.test(hung ?? "") ? "double" : "single", weatherstrip: false,
            furniture: scope === "external" ? "entry" : "none",
          });
        });
        if (imported.length) {
          const nextDoors = [...currentDoors, ...imported];
          latestDoorsRef.current = nextDoors;
          setDoors(nextDoors);
          persistDoors(nextDoors);
        }
        const message = rows.length ? `Loaded current LockOut data from EMS${skipped ? ` (${skipped} invalid row${skipped === 1 ? "" : "s"} skipped)` : ""}. Existing imported rows are not duplicated.` : "No current LockOut data for this job.";
        setSourceMessage(message);
        publishAiImportStatus({ sheetId, status: rows.length ? (skipped ? "warning" : "success") : "warning", message });
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Could not load LockOut data.";
        setSourceError(message);
        publishAiImportStatus({ sheetId, status: "error", message });
      } finally {
        setSourceLoading(false);
      }
    };

    window.addEventListener("workpack:add-data-ai", handleAddData);
    return () => window.removeEventListener("workpack:add-data-ai", handleAddData);
  }, [clientShortName, jobId, sheetId]);

  const { result: calculation, status: calculationStatus, error: calculationError } = useCustomerCalculator<{
    doorRows: Array<WorkflowOutputRow & { key: string }>;
    jambRows: Array<WorkflowOutputRow & { key: string }>;
    auto: Array<{ key: string; code: string; description: string; qty: number; unit: string; source: string }>;
    hinges: number; stopBead: number; rows: WorkflowOutputRow[];
  }>("BUN-NSW-ACT", "lock-up", { doors }, { doorRows: [], jambRows: [], auto: [], hinges: 0, stopBead: 0, rows: [] });

  useEffect(() => {
    if (calculationStatus !== "ok") return;

    const generated: WorkflowOutputRow[] = [
      ...calculation.doorRows
        .filter((row) => numberValue(String(row.qty)) > 0)
        .map(({ key: _key, ...row }) => row),
      ...calculation.jambRows
        .filter((row) => numberValue(String(row.qty)) > 0)
        .map(({ key: _key, ...row }) => row),
      ...calculation.auto
        .filter((row) => row.qty > 0)
        .map((row) => ({
          item_number: row.code,
          description: row.description,
          qty: row.qty,
          unit: row.unit,
          comments: row.source,
        })),
    ];

    const generatedIdentity = (row: WorkflowOutputRow) =>
      `${String(row.item_number || "").trim()}::${String(row.description || "").trim()}`;

    // Remove BOTH:
    // - rows generated by the current calculator result
    // - rows generated by the immediately previous calculator result
    //
    // This is required when a DB-backed product mapping changes Item Code or
    // Description between calculations. Without previous identities, the old
    // generated row can be mistaken for manual data and appended forever.
    const currentGeneratedIdentities = new Set(generated.map(generatedIdentity));
    const knownGeneratedIdentities = new Set([
      ...generatedRowIdentitiesRef.current,
      ...currentGeneratedIdentities,
    ]);

    const currentData = latestDataRef.current;
    const manual = currentData.rows.filter((row) => {
      if (knownGeneratedIdentities.has(generatedIdentity(row))) return false;

      // Backward cleanup for generated rows saved by older builds.
      const comments = String(row.comments || "");
      const generatedByLockup =
        comments.includes("Lock Up!") ||
        comments.includes("DB catalog match") ||
        comments.includes("No DB catalog match") ||
        comments.includes("DB jamb selector") ||
        comments.includes("Lock Up jamb selector") ||
        comments.includes("Timber Jambs key") ||
        comments.includes("Lock Up loose-jamb lookup");

      return !generatedByLockup;
    });

    const nextFields = {
      ...currentData.fields,
      lockup_doors: JSON.stringify(doors),
    };
    const nextRows = [...generated, ...manual];

    generatedRowIdentitiesRef.current = currentGeneratedIdentities;

    // Parent update must be idempotent. If nothing materially changed, do not
    // touch ApplicationShell/WorkPack state at all.
    if (
      currentData.fields.lockup_doors === nextFields.lockup_doors &&
      JSON.stringify(currentData.rows) === JSON.stringify(nextRows)
    ) {
      return;
    }

    latestOnChangeRef.current({
      ...currentData,
      fields: nextFields,
      rows: nextRows,
    });
  }, [
    calculation.auto,
    calculation.doorRows,
    calculation.jambRows,
    calculationStatus,
    doors,
  ]);

  const groupKey = (mode: DoorMode, scope: DoorScope) => `${mode}-${scope}`;
  const getDraft = (mode: DoorMode, scope: DoorScope) => drafts[groupKey(mode, scope)] ?? newDraft(mode);
  const updateDraft = (mode: DoorMode, scope: DoorScope, patch: Partial<Draft>) => {
    const key = groupKey(mode, scope);
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? newDraft(mode)), ...patch } }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  function addDoor(mode: DoorMode, scope: DoorScope) {
    const key = groupKey(mode, scope);
    const draft = getDraft(mode, scope);
    const height = numberValue(draft.height === "Spec" ? draft.customHeight : draft.height);
    const width = numberValue(draft.width === "Spec" ? draft.customWidth : draft.width);
    const qty = numberValue(draft.qty);
    if (!draft.label.trim() || !draft.doorName || !height || !width || !qty) {
      setErrors((current) => ({ ...current, [key]: "Select a door type and enter door label, size and quantity." }));
      return;
    }
    const steel = /steel/i.test(draft.jambOrWall) || draft.jamb === "Steel Frame" || (mode === "prehung" && draft.doorType === "Steel Frame");
    const doubleDoor = mode === "prehung" && draft.hung === "Double Door Set";
    const category = scope === "internal" ? "DOOR INT" : "DOOR EXT FLUSH";
    const outputDescription = [category, `${height}X${width}`, draft.doorName, draft.label.trim(), mode === "prehung" ? draft.hung : "", scope === "internal" ? draft.internalType : "", scope === "internal" ? draft.color : ""].filter(Boolean).join(" ++ ");
    const nextDoor: Door = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, mode, scope, label: draft.label.trim(), doorName: draft.doorName,
      itemNumber: "", description: outputDescription, height, width, thickness: draft.thickness, jamb: mode === "loose-jamb" ? draft.jamb : undefined, jambOrWall: draft.jambOrWall,
      hung: mode === "prehung" ? draft.hung : undefined, doorType: mode === "prehung" ? draft.doorType : undefined, doorStop: draft.doorStop, qty, frame: steel ? "steel" : "timber",
      internalType: scope === "internal" ? draft.internalType : undefined, color: scope === "internal" ? draft.color : undefined,
      configuration: doubleDoor ? "double" : "single", weatherstrip: false, furniture: scope === "external" ? "entry" : "none",
    };
    const nextDoors = [...latestDoorsRef.current, nextDoor];
    latestDoorsRef.current = nextDoors;
    setDoors(nextDoors);
    persistDoors(nextDoors);
    setDrafts((current) => ({ ...current, [key]: newDraft(mode) }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  function saveEditingDoor() {
    if (!editingDoor) return;
    const nextDoors = latestDoorsRef.current.map((door) => door.id === editingDoor.id ? editingDoor : door);
    latestDoorsRef.current = nextDoors;
    setDoors(nextDoors);
    persistDoors(nextDoors);
    setEditingDoor(null);
  }

  function removeDoor(door: Door) {
    if (!window.confirm(`Delete ${door.label || "this door"}?`)) return;
    const nextDoors = latestDoorsRef.current.filter((item) => item.id !== door.id);
    latestDoorsRef.current = nextDoors;
    setDoors(nextDoors);
    persistDoors(nextDoors);
    if (selectedDoorId === door.id) setSelectedDoorId("");
    if (editingDoor?.id === door.id) setEditingDoor(null);
  }

  function renderDoorGroup(mode: DoorMode, scope: DoorScope, title: string) {
    const key = groupKey(mode, scope);
    const draft = getDraft(mode, scope);
    const fallbackDoorNames =
      mode === "prehung" ? PREHUNG_DOOR_NAMES : LOOSE_JAMB_DOOR_NAMES;
    const doorNames = workbookDoorNames[scope].length
      ? workbookDoorNames[scope]
      : fallbackDoorNames;
    const displayHeight =
      draft.height === "Spec" ? draft.customHeight || "Spec" : draft.height;
    const displayWidth =
      draft.width === "Spec" ? draft.customWidth || "Spec" : draft.width;

    return (
      <CollapsibleSubgroup
        key={key}
        title={
          <span className="lockup-tab-title">
            <span>{title}</span>
            <em>
              {displayHeight} × {displayWidth}
            </em>
          </span>
        }
        className="lockup-input-group"
      >
        <div className="lockup-form-grid">
          <label className="fh-field">
            <span>
              {mode === "prehung" ? "Prehung Doors" : "Loose Jamb Doors"}
            </span>

            <input
              className="fh-required"
              value={draft.label}
              placeholder="e.g. Entry Door"
              onChange={(event) =>
                updateDraft(mode, scope, {
                  label: event.target.value,
                  internalType: suggestedInternalType(
                    event.target.value,
                    draft.hung,
                  ),
                })
              }
            />
          </label>

          <label className="fh-field lockup-door-name lockup-door-name-field">
            <span>Door Type</span>
            <SearchDropdown
              value={draft.doorName}
              options={doorNames}
              onChange={(doorName) => updateDraft(mode, scope, { doorName })}
              placeholder="Select or search..."
              inputClassName="fh-required"
              emptyText="No matching door name."
            />
          </label>

          <SelectField
            label="Door Height"
            value={draft.height}
            options={LOCKUP_HEIGHTS}
            onChange={(height) =>
              updateDraft(mode, scope, {
                height,
              })
            }
          />

          {draft.height === "Spec" && (
            <label className="fh-field">
              <span>
                Custom Height <small>mm</small>
              </span>

              <input
                className="fh-required"
                inputMode="numeric"
                value={draft.customHeight}
                onChange={(event) =>
                  /^\d*$/.test(event.target.value) &&
                  updateDraft(mode, scope, {
                    customHeight: event.target.value,
                  })
                }
              />
            </label>
          )}

          <SelectField
            label="Door Width"
            value={draft.width}
            options={LOCKUP_WIDTHS}
            onChange={(width) =>
              updateDraft(mode, scope, {
                width,
              })
            }
          />

          {draft.width === "Spec" && (
            <label className="fh-field">
              <span>
                Custom Width <small>mm</small>
              </span>

              <input
                className="fh-required"
                inputMode="numeric"
                value={draft.customWidth}
                onChange={(event) =>
                  /^\d*$/.test(event.target.value) &&
                  updateDraft(mode, scope, {
                    customWidth: event.target.value,
                  })
                }
              />
            </label>
          )}

          <SelectField
            label="Thicks"
            value={draft.thickness}
            options={LOCKUP_THICKNESSES}
            onChange={(thickness) =>
              updateDraft(mode, scope, {
                thickness,
              })
            }
          />

          <label className="fh-field">
            <span>Jamb or Wall for Steel Frame</span>

            <input
              value={draft.jambOrWall}
              placeholder="Enter jamb or wall"
              onChange={(event) =>
                updateDraft(mode, scope, {
                  jambOrWall: event.target.value,
                })
              }
            />
          </label>

          <label className="fh-field">
            <span>Qty</span>

            <input
              className="fh-required"
              inputMode="decimal"
              value={draft.qty}
              onChange={(event) =>
                /^\d*(?:[.,]\d*)?$/.test(event.target.value) &&
                updateDraft(mode, scope, {
                  qty: event.target.value,
                })
              }
            />
          </label>

          {mode === "loose-jamb" && (
            <SelectField
              label="Jamb Size"
              value={draft.jamb}
              options={LOOSE_JAMBS}
              onChange={(jamb) =>
                updateDraft(mode, scope, {
                  jamb,
                })
              }
            />
          )}

          {mode === "prehung" && (
            <SelectField
              label="Hung"
              value={draft.hung}
              options={LOCKUP_HUNG}
              onChange={(hung) =>
                updateDraft(mode, scope, {
                  hung,
                  internalType: suggestedInternalType(draft.label, hung),
                })
              }
            />
          )}

          {mode === "prehung" && (
            <SelectField
              label="Type"
              value={draft.doorType}
              options={LOCKUP_TYPES}
              onChange={(doorType) =>
                updateDraft(mode, scope, {
                  doorType,
                })
              }
            />
          )}

          <SelectField
            label="Door Stop"
            value={draft.doorStop}
            options={LOCKUP_DOOR_STOPS}
            onChange={(doorStop) =>
              updateDraft(mode, scope, {
                doorStop,
              })
            }
          />

          {scope === "internal" && (
            <SelectField
              label="Internal Type"
              value={draft.internalType}
              options={["HF", "HO"]}
              onChange={(internalType) =>
                updateDraft(mode, scope, {
                  internalType: internalType as Draft["internalType"],
                })
              }
            />
          )}

          {scope === "internal" && (
            <SelectField
              label="Color"
              value={draft.color}
              options={["CHR", "SCH"]}
              onChange={(color) =>
                updateDraft(mode, scope, {
                  color: color as Draft["color"],
                })
              }
            />
          )}

          <button
            type="button"
            className="fh-add-wall"
            onClick={() => addDoor(mode, scope)}
          >
            + Add door
          </button>
        </div>

        <div className={errors[key] ? "fh-hint error" : "fh-hint"}>
          {errors[key] ||
            `Door Type options loaded from ${
              mode === "prehung" ? "List_Prehung" : "List_LooseJamb"
            }.`}
        </div>
      </CollapsibleSubgroup>
    );
  }

  return (
    <div className="fh-module lockup-module">
      <header className="module-heading fh-title-row">
        <div>
          <h1>Lock Up</h1>
          <p>Door selections follow the Bunnings NSW Lock Up template.</p>
        </div>
      </header>

      <section className="fh-card">
        <div className="fh-card-title">1. Door information</div>

        <div className="collapsible-subgroup-stack lockup-input-groups">
          <CollapsibleSubgroup title="Prehung" className="lockup-mode-group">
            <div className="collapsible-subgroup-stack lockup-scope-groups">
              {renderDoorGroup("prehung", "external", "External Door")}
              {renderDoorGroup("prehung", "internal", "Internal Door")}
            </div>
          </CollapsibleSubgroup>

          <CollapsibleSubgroup
            title="Loose Jamb"
            className="lockup-mode-group"
          >
            <div className="collapsible-subgroup-stack lockup-scope-groups">
              {renderDoorGroup("loose-jamb", "external", "External Door")}
              {renderDoorGroup("loose-jamb", "internal", "Internal Door")}
            </div>
          </CollapsibleSubgroup>
        </div>
      </section>


      {calculationStatus === "error" && (
        <div className="fh-hint error">
          Lock Up calculator failed: {calculationError || "Unknown calculator error"}
        </div>
      )}

      <section className="fh-card lockup-entered-card">
        <div className="fh-card-title lockup-entered-title">
          <span>2. Entered doors</span>
        </div>

        <div className="fh-table-wrap">
          <table className="fh-table lockup-door-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Category</th>
                <th>Location</th>
                <th>Label</th>
                <th>Door Type</th>
                <th>Height</th>
                <th>Width</th>
                <th>Thicks</th>
                <th>Jamb / wall</th>
                <th>Jamb Size</th>
                <th>Hung</th>
                <th>Type</th>
                <th>HF/HO</th>
                <th>Color</th>
                <th>Stop</th>
                <th>Qty</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {doors.map((door, index) => {
                const editing = editingDoor?.id === door.id;
                const d = editing ? editingDoor : door;
                const selected = selectedDoorId === door.id;
                const secondaryDoorName = door.doorName || door.description;

                const text = (field: keyof Door) => (
                  <input
                    value={String(d[field] ?? "")}
                    onChange={(event) =>
                      setEditingDoor({
                        ...d,
                        [field]: event.target.value,
                      })
                    }
                  />
                );

                return (
                  <tr
                    key={door.id}
                    className={`ui-editable-row ${editing ? "ui-editing-row " : ""}${
                      selected ? "lockup-selected-row" : ""
                    }`}
                    onClick={() => setSelectedDoorId(door.id)}
                    onDoubleClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
                      setSelectedDoorId(door.id);
                      setEditingDoor({ ...door });
                    }}
                  >
                    <td>{index + 1}</td>

                    <td>
                      {editing ? (
                        <select
                          value={d.mode}
                          onChange={(event) =>
                            setEditingDoor({
                              ...d,
                              mode: event.target.value as DoorMode,
                            })
                          }
                        >
                          <option value="prehung">Prehung</option>
                          <option value="loose-jamb">Loose Jamb</option>
                        </select>
                      ) : door.mode === "loose-jamb" ? (
                        "Loose Jamb"
                      ) : (
                        "Prehung"
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <select
                          value={d.scope}
                          onChange={(event) =>
                            setEditingDoor({
                              ...d,
                              scope: event.target.value as DoorScope,
                            })
                          }
                        >
                          <option value="internal">Internal</option>
                          <option value="external">External</option>
                        </select>
                      ) : door.scope === "internal" ? (
                        "Internal"
                      ) : (
                        "External"
                      )}
                    </td>

                    <td>
                      {editing ? text("label") : door.label}
                    </td>

                    <td>
                      {editing ? text("doorName") : (secondaryDoorName || "-")}
                    </td>

                    <td>
                      {editing ? (
                        <input
                          inputMode="numeric"
                          value={d.height}
                          onChange={(event) =>
                            setEditingDoor({
                              ...d,
                              height: numberValue(event.target.value),
                            })
                          }
                        />
                      ) : door.height}
                    </td>

                    <td>
                      {editing ? (
                        <input
                          inputMode="numeric"
                          value={d.width}
                          onChange={(event) =>
                            setEditingDoor({
                              ...d,
                              width: numberValue(event.target.value),
                            })
                          }
                        />
                      ) : door.width}
                    </td>

                    <td>
                      {editing ? text("thickness") : door.thickness || "-"}
                    </td>

                    <td>
                      {editing
                        ? text("jambOrWall")
                        : door.jambOrWall || door.frame}
                    </td>

                    <td>
                      {editing
                        ? text("jamb")
                        : door.mode === "loose-jamb"
                          ? door.jamb || "-"
                          : "-"}
                    </td>

                    <td>
                      {editing
                        ? text("hung")
                        : door.mode === "prehung"
                          ? door.hung || door.configuration
                          : "-"}
                    </td>

                    <td>
                      {editing
                        ? text("doorType")
                        : door.mode === "prehung"
                          ? door.doorType || "-"
                          : "-"}
                    </td>

                    <td>
                      {editing
                        ? text("internalType")
                        : door.internalType || "-"}
                    </td>

                    <td>{editing ? text("color") : door.color || "-"}</td>

                    <td>
                      {editing ? text("doorStop") : door.doorStop || "-"}
                    </td>

                    <td className="fh-number">
                      {editing ? (
                        <input
                          inputMode="decimal"
                          value={d.qty}
                          onChange={(event) =>
                            setEditingDoor({
                              ...d,
                              qty: numberValue(event.target.value),
                            })
                          }
                        />
                      ) : (
                        format(door.qty)
                      )}

                    </td>
                    <td><div className="ui-row-actions">
                      {editing ? (
                        <>
                          <button className="ui-row-save" type="button" onClick={saveEditingDoor} aria-label="Save row" title="Save row">✓</button>
                          <button className="ui-row-cancel" type="button" onClick={() => setEditingDoor(null)} aria-label="Cancel editing">×</button>
                        </>
                      ) : (
                        <button
                          className="fh-remove"
                          type="button"
                          aria-label={`Delete ${door.label}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeDoor(door);
                          }}
                        >×</button>
                      )}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!doors.length && (
            <div className="fh-empty">No doors entered.</div>
          )}
        </div>
      </section>

      <section className="fh-card">
        <div className="fh-card-title">3. Automatic Lock Up schedule</div>

        <div className="fh-summary">
          <div className="fh-kpi">
            <strong>{doors.length}</strong>
            <span>Door rows</span>
          </div>

          <div className="fh-kpi">
            <strong>
              {format(doors.reduce((sum, door) => sum + door.qty, 0))}
            </strong>
            <span>Total doors</span>
          </div>

          <div className="fh-kpi">
            <strong>{calculation.hinges}</strong>
            <span>Hinges</span>
          </div>

          <div className="fh-kpi">
            <strong>{calculation.stopBead}</strong>
            <span>Stop bead lengths</span>
          </div>
        </div>

        <div className="fh-table-wrap">
          <table className="fh-table fh-output-table lockup-output-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Code</th>
              </tr>
            </thead>

            <tbody>
              {(calculationStatus === "idle" || calculationStatus === "loading") ? (
                <ScheduleLoadingRow colSpan={4} label="Calculating Lock Up schedule" />
              ) : <>
              {[...calculation.doorRows, ...calculation.jambRows]
                .filter((row) => numberValue(String(row.qty)) > 0)
                .map((row) => (
                  <tr key={row.key}>
                    <td>{row.description}</td>
                    <td className="fh-number fh-qty">
                      {format(numberValue(String(row.qty)))}
                    </td>
                    <td>{row.unit}</td>
                    <td className="fh-code">
                      {row.item_number || "Match required"}
                    </td>
                  </tr>
                ))}

              {calculation.auto
                .filter((row) => row.qty > 0)
                .map((row) => (
                  <tr key={row.key}>
                    <td>{row.description}</td>
                    <td className="fh-number fh-qty">
                      {format(row.qty)}
                    </td>
                    <td>{row.unit}</td>
                    <td className="fh-code">{row.code}</td>
                  </tr>
                ))}
              </>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

}
