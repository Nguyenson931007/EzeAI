import "../styles/FrameHardwareForm.css";
import CollapsibleSubgroup from "../../../components/CollapsibleSubgroup";
import ScheduleLoadingRow from "../../../components/ScheduleLoadingRow";
import { useEffect, useRef, useState } from "react";
import { publishAiImportStatus } from "../../../ui/aiImportStatus";
import { createPortal } from "react-dom";
import { getEmsFrameWork, saveEmsFrameWork } from "../../../api";
import type { WorkflowOutputRow, WorkPackFileData } from "../../../types";
import { useCustomerCalculator } from "../../useCustomerCalculator";
import {
  FRAME_WALL_HEIGHTS as HEIGHTS,
  formatInputNumber as formatNumber,
  nonNegativeNumber as num,
  normalizeImportedWallAbove,
  normalizeImportedWallHeight,
  normalizeImportedWallLength,
  type NormalizedWallAbove as WallAbove,
} from "../support/normalization";

type RodSize = "M12" | "M16";

type WallEntry = {
  id: string;
  sourceId?: string;
  edited?: boolean;
  wallHeight: number;
  wallLength: number;
  spacing: number;
  wallAbove: WallAbove;
  rodSize: RodSize;
};

type LegacyWallEntry = {
  id?: string;
  height?: number;
  length?: number;
  wind?: string;
  base?: "slab" | "timber";
  rodSize?: RodSize;
};

type ExtraValues = {
  extra2700: string;
  extra3000: string;
  extra3600: string;
  extraNW: string;
  braceBoard: string;
  jamb140: string;
  jamb160: string;
};

type Props = {
  data: WorkPackFileData;
  onChange: (data: WorkPackFileData) => void;
  clientShortName: string;
  jobId: string;
  sheetId: string;
  aiImportRequest?: number;
  readOnly?: boolean;
};

const EMPTY_EXTRAS: ExtraValues = {
  extra2700: "0",
  extra3000: "0",
  extra3600: "0",
  extraNW: "0",
  braceBoard: "0",
  jamb140: "0",
  jamb160: "0",
};

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeWalls(value: string | undefined): WallEntry[] {
  const raw = parseJson<Array<WallEntry | LegacyWallEntry>>(value, []);
  return raw.flatMap((wall, index) => {
    const current = wall as WallEntry;
    if (current.wallHeight && current.wallLength && current.wallAbove) {
      return [{
        id: current.id || `wall-${index}`,
        sourceId: current.sourceId,
        wallHeight: num(current.wallHeight),
        wallLength: num(current.wallLength),
        spacing: num(current.spacing) || 900,
        wallAbove: current.wallAbove,
        rodSize: current.rodSize === "M16" ? "M16" : "M12",
      }];
    }

    const legacy = wall as LegacyWallEntry;
    if (!legacy.height || !legacy.length || !legacy.base) return [];
    return [{
      id: legacy.id || `legacy-wall-${index}`,
      wallHeight: num(legacy.height),
      wallLength: num(legacy.length),
      spacing: 900,
      wallAbove: legacy.base === "slab" ? "concrete-slab-floor" : "timber-floor",
      rodSize: legacy.rodSize === "M16" ? "M16" : "M12",
    }];
  });
}

function sameRows(left: WorkflowOutputRow[], right: WorkflowOutputRow[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function generatedRowIdentity(row: WorkflowOutputRow): string {
  return `${String(row.item_number ?? "").trim()}::${String(row.description ?? "").trim()}`;
}

function WallInputGroup({
  wallAbove,
  label,
  onSave,
}: {
  wallAbove: WallAbove;
  label: string;
  onSave: (
    wallAbove: WallAbove,
    wallHeight: number,
    wallLength: number,
    spacing: number,
    rodSize: RodSize,
    editId?: string,
  ) => string | null;
}) {
  const [height, setHeight] = useState("");
  const [length, setLength] = useState("");
  const [spacing, setSpacing] = useState("900");
  const [rodSize, setRodSize] = useState<RodSize>("M12");
  const [error, setError] = useState("");

  const clearForm = () => {
    setHeight("");
    setLength("");
    setSpacing("900");
    setRodSize("M12");
    setError("");
  };

  const save = () => {
    const message = onSave(
      wallAbove,
      num(height),
      num(length),
      num(spacing),
      rodSize,
    );
    if (message) return setError(message);
    clearForm();
  };

  return (
    <CollapsibleSubgroup title={label}>
      <div className="fh-form-grid fh-form-grid-grouped">
        <label className="fh-field">
          <span>Wall Height</span>
          <select value={height} onChange={(event) => setHeight(event.target.value)}>
            <option value="">Select...</option>
            {HEIGHTS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <label className="fh-field">
          <span>Wall Length <small>mm</small></span>
          <input
            className="fh-required"
            value={length}
            inputMode="decimal"
            placeholder="Enter millimetres..."
            onChange={(event) =>
              /^\d*(?:[.,]\d*)?$/.test(event.target.value) && setLength(event.target.value)
            }
            onKeyDown={(event) => event.key === "Enter" && save()}
          />
        </label>

        <label className="fh-field">
          <span>Spacing <small>mm</small></span>
          <input
            className="fh-required"
            value={spacing}
            inputMode="decimal"
            onChange={(event) =>
              /^\d*(?:[.,]\d*)?$/.test(event.target.value) && setSpacing(event.target.value)
            }
            onBlur={() => !num(spacing) && setSpacing("900")}
          />
        </label>

        <label className="fh-field">
          <span>Rod Size</span>
          <select value={rodSize} onChange={(event) => setRodSize(event.target.value as RodSize)}>
            <option value="M12">M12</option>
            <option value="M16">M16</option>
          </select>
        </label>

        <div className="fh-entry-actions">
          <button type="button" className="fh-add-wall" onClick={save}>
            + Add wall
          </button>
        </div>
      </div>

      {error && <div className="fh-hint error">{error}</div>}
    </CollapsibleSubgroup>
  );
}

export default function BunNswActFrameHardwareForm({ data, onChange, clientShortName, jobId, sheetId, aiImportRequest = 0, readOnly = false }: Props) {
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setToolbarHost(document.getElementById("frame-hardware-toolbar-actions"));
  }, []);
  const [walls, setWalls] = useState<WallEntry[]>(() =>
    normalizeWalls(data.fields.frame_hardware_walls)
  );
  const [extras, setExtras] = useState<ExtraValues>(() => ({
    ...EMPTY_EXTRAS,
    ...parseJson<Partial<ExtraValues>>(data.fields.frame_hardware_extras, {}),
  }));
  const [frameWorkLoading, setFrameWorkLoading] = useState(false);
  const [frameWorkError, setFrameWorkError] = useState("");
  const [frameWorkImportMessage, setFrameWorkImportMessage] = useState("");
  const [frameWorkSaveLoading, setFrameWorkSaveLoading] = useState(false);
  const [frameWorkSaveMessage, setFrameWorkSaveMessage] = useState("");
  const [frameWorkSaveError, setFrameWorkSaveError] = useState("");
  const [editingWallId, setEditingWallId] = useState<string | null>(null);
  const [editingWallDraft, setEditingWallDraft] = useState<WallEntry | null>(null);
  const [wallEditError, setWallEditError] = useState("");
  // Remember calculator-owned rows by the actual DB-resolved identity returned
  // by the calculator. This must not depend on a hard-coded product catalogue:
  // Using/DataFind can legitimately replace Item Codes/descriptions.
  const generatedRowIdentitiesRef = useRef<Set<string>>(new Set());
  // The wall-entry selector always starts at M12.
  // Each saved wall keeps its own rodSize, so mixed M12/M16 outputs still work.

  // data/extras/onChange are read via refs inside the effect below so that
  // the effect's own onChange(...) call (which produces a new `data` object
  // from the parent) does not re-trigger the effect. Previously `data` and
  // `onChange` were direct dependencies, so: fetch -> onChange -> new data
  // identity -> effect re-runs -> fetch again, forever (Maximum update depth
  // exceeded / ERR_INSUFFICIENT_RESOURCES from the runaway request volume).
  const latestDataRef = useRef(data);
  const latestWallsRef = useRef(walls);
  const latestExtrasRef = useRef(extras);
  const latestOnChangeRef = useRef(onChange);
  latestDataRef.current = data;
  latestWallsRef.current = walls;
  latestExtrasRef.current = extras;
  latestOnChangeRef.current = onChange;

  const persistRawState = (nextWalls: WallEntry[], nextExtras: ExtraValues) => {
    latestOnChangeRef.current({
      ...latestDataRef.current,
      fields: {
        ...latestDataRef.current.fields,
        frame_hardware_walls: JSON.stringify(nextWalls),
        frame_hardware_extras: JSON.stringify(nextExtras),
        frame_hardware_rod_size: "M12",
      },
    });
  };

  useEffect(() => {
    // Do not import DB data automatically. Import only when the user presses Add data AI.
    if (!aiImportRequest) return;

    if (!jobId || clientShortName !== "BUN-NSW-ACT") {
      publishAiImportStatus({ sheetId, status: "error", message: "Select a BUN NSW/ACT job before adding AI data." });
      setFrameWorkError("Select a BUN NSW/ACT job before adding AI data.");
      setFrameWorkImportMessage("");
      return;
    }

    let cancelled = false;
    publishAiImportStatus({ sheetId, status: "loading", message: "Loading Frame Hardware data..." });
    setFrameWorkLoading(true);
    setFrameWorkError("");
    setFrameWorkImportMessage("");

    getEmsFrameWork(clientShortName, jobId)
      .then((rows) => {
        if (cancelled) return;

        const currentWalls = latestWallsRef.current;
        const alreadyImportedSourceIds = new Set(
          currentWalls.flatMap((wall) =>
            String(wall.sourceId ?? "").split("|").filter(Boolean)
          )
        );
        const importedWalls: WallEntry[] = [];

        rows.forEach((row, index) => {
          if (alreadyImportedSourceIds.has(row.id)) return;

          // Keep the existing AI-import height normalization before applying the
          // same validation rules used by manual Add wall.
          const wallAbove = normalizeImportedWallAbove(row.wall_above);
          const wallHeight = normalizeImportedWallHeight(row.wall_height);
          const wallLength = normalizeImportedWallLength(row.wall_length);
          const spacing = num(row.spacing) || 900;
          const rodSize: RodSize = String(row.rod_size ?? "").trim().toUpperCase() === "M16"
            ? "M16"
            : "M12";

          if (!wallAbove || !wallHeight || wallLength <= 0 || spacing <= 0) return;
          if (wallAbove === "timber-floor" && wallHeight === 8800) return;

          // One active DB row becomes one entered wall, exactly like one manual
          // Add wall action. Do not group rows because Spacing/RodSize belong to
          // each individual wall record.
          importedWalls.push({
            id: `db-ai-${jobId}-${row.id}-${Date.now()}-${index}`,
            sourceId: row.id,
            wallHeight,
            wallLength,
            spacing,
            wallAbove,
            rodSize,
          });
        });

        const message = importedWalls.length
          ? `Loaded ${importedWalls.length} Frame Hardware wall${importedWalls.length === 1 ? "" : "s"} from DB.`
          : "No new DB wall data to add.";
        setFrameWorkImportMessage(message);
        publishAiImportStatus({ sheetId, status: importedWalls.length ? "success" : "warning", message });

        if (importedWalls.length) {
          const nextWalls = [...currentWalls, ...importedWalls];
          latestWallsRef.current = nextWalls;
          setWalls(nextWalls);
          // Store the entered walls in the parent draft immediately. Switching
          // tabs unmounts this form, so persistence cannot wait for a later
          // calculator render/effect.
          persistRawState(nextWalls, latestExtrasRef.current);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Could not load FrameWork data.";
          setFrameWorkError(message);
          publishAiImportStatus({ sheetId, status: "error", message });
        }
      })
      .finally(() => {
        if (!cancelled) setFrameWorkLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Only the request token (bumped when the user presses "Add data AI")
    // and the job/customer/sheet identity should start a new fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiImportRequest, jobId, clientShortName, sheetId]);

  const { result: calculation, status: calculationStatus } = useCustomerCalculator<{
    displayRows: Array<WorkflowOutputRow & { source: string }>;
    quotationRows: WorkflowOutputRow[];
    wallDetails: Array<{ id: string; rodDemand: number; rodMapping: string }>;
    slabLength: number;
    timberLength: number;
    totalLength: number;
    chemset: number;
  }>(
    "BUN-NSW-ACT",
    "frame-hardware",
    { walls, extras },
    { displayRows: [], quotationRows: [], wallDetails: [], slabLength: 0, timberLength: 0, totalLength: 0, chemset: 0 },
  );

  useEffect(() => {
    if (calculationStatus !== "ok") return;
    const fields = {
      ...data.fields,
      frame_hardware_walls: JSON.stringify(walls),
      frame_hardware_extras: JSON.stringify(extras),
      frame_hardware_rod_size: "M12",
    };
    // The calculator result is authoritative for generated material rows.
    // Add the *resolved* identities first, then remove any previous copy from
    // the draft. This keeps the effect idempotent even when DB Using/DataFind
    // maps a formula/output key to an Item Code that is not in the legacy
    // workbook fallback list. Without this, every render appended another copy
    // and caused React's "Maximum update depth exceeded" request storm.
    for (const row of calculation.quotationRows) {
      generatedRowIdentitiesRef.current.add(generatedRowIdentity(row));
    }

    const generatedItemNumbers = new Set(calculation.displayRows.map((row) => row.item_number).filter(Boolean));
    const retainedManualRows = data.rows.filter((row) =>
      !generatedItemNumbers.has(row.item_number)
      && !generatedRowIdentitiesRef.current.has(generatedRowIdentity(row))
    );
    const nextRows = [...calculation.quotationRows, ...retainedManualRows];
    if (
      data.fields.frame_hardware_walls === fields.frame_hardware_walls &&
      data.fields.frame_hardware_extras === fields.frame_hardware_extras &&
      data.fields.frame_hardware_rod_size === fields.frame_hardware_rod_size &&
      sameRows(data.rows, nextRows)
    ) {
      return;
    }
    onChange({ ...data, fields, rows: nextRows });
  }, [walls, extras, calculationStatus, calculation.quotationRows, data, onChange]);

  function saveWall(
    wallAbove: WallAbove,
    parsedHeight: number,
    parsedLength: number,
    parsedSpacing: number,
    rodSize: RodSize,
    editId?: string,
  ): string | null {
    if (!parsedHeight || parsedLength <= 0 || parsedSpacing <= 0) {
      return "Select Wall Height, then enter Wall Length and Spacing.";
    }
    if (wallAbove === "timber-floor" && parsedHeight === 8800) {
      return "8800mm height is not supported for Timber Floor walls.";
    }

    if (editId) {
      const nextWalls = latestWallsRef.current.map((wall) =>
        wall.id === editId
          ? {
              ...wall,
              wallAbove,
              wallHeight: parsedHeight,
              wallLength: parsedLength,
              spacing: parsedSpacing,
              rodSize,
              edited: true,
            }
          : wall
      );
      latestWallsRef.current = nextWalls;
      setWalls(nextWalls);
      persistRawState(nextWalls, latestExtrasRef.current);
      setEditingWallId(null);
      return null;
    }

    const nextWalls = [
      ...latestWallsRef.current,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        wallHeight: parsedHeight,
        wallLength: parsedLength,
        spacing: parsedSpacing,
        wallAbove,
        rodSize,
      },
    ];
    latestWallsRef.current = nextWalls;
    setWalls(nextWalls);
    persistRawState(nextWalls, latestExtrasRef.current);
    return null;
  }

  async function handleSaveFrameWork() {
    if (!jobId || clientShortName !== "BUN-NSW-ACT") {
      setFrameWorkSaveError("Select a BUN NSW/ACT job before saving Frame Work.");
      setFrameWorkSaveMessage("");
      return;
    }

    if (!window.confirm(
      `Save Frame Work as a new version? Current active DB rows will be kept as history and ${walls.length} new row${walls.length === 1 ? "" : "s"} will become current.`
    )) {
      return;
    }

    setFrameWorkSaveLoading(true);
    setFrameWorkSaveError("");
    setFrameWorkSaveMessage("");

    try {
      const result = await saveEmsFrameWork(clientShortName, jobId, {
        rows: walls.map((wall) => ({
          wall_height: wall.wallHeight,
          wall_length: wall.wallLength,
          wall_above: wall.wallAbove === "concrete-slab-floor" ? "Slab" : "Timber",
          spacing: wall.spacing,
          rod_size: wall.rodSize,
        })),
      });

      const savedAt = new Date(result.datetime_update).toLocaleString();
      setFrameWorkSaveMessage(
        `Saved ${result.inserted_count} current row${result.inserted_count === 1 ? "" : "s"}; archived ${result.archived_count}. Updated by ${result.user_update} at ${savedAt}.`
      );
    } catch (error) {
      setFrameWorkSaveError(
        error instanceof Error ? error.message : "Could not save Frame Work."
      );
    } finally {
      setFrameWorkSaveLoading(false);
    }
  }


  function updateExtra(key: keyof ExtraValues, value: string) {
    if (!/^\d*(?:[.,]\d*)?$/.test(value)) return;
    const nextExtras = { ...latestExtrasRef.current, [key]: value };
    latestExtrasRef.current = nextExtras;
    setExtras(nextExtras);
    persistRawState(latestWallsRef.current, nextExtras);
  }

  function resetSheet() {
    latestWallsRef.current = [];
    latestExtrasRef.current = EMPTY_EXTRAS;
    setWalls([]);
    setExtras(EMPTY_EXTRAS);
    setEditingWallId(null);
    setEditingWallDraft(null);
    setWallEditError("");
    persistRawState([], EMPTY_EXTRAS);
  }

  function removeWall(wallId: string) {
    if (!window.confirm("Delete this wall?")) return;
    const nextWalls = latestWallsRef.current.filter((item) => item.id !== wallId);
    latestWallsRef.current = nextWalls;
    setWalls(nextWalls);
    setEditingWallId((current) => current === wallId ? null : current);
    if (editingWallId === wallId) {
      setEditingWallDraft(null);
      setWallEditError("");
    }
    persistRawState(nextWalls, latestExtrasRef.current);
  }

  function beginWallEdit(wall: WallEntry) {
    setEditingWallId(wall.id);
    setEditingWallDraft({ ...wall });
    setWallEditError("");
  }

  function cancelWallEdit() {
    setEditingWallId(null);
    setEditingWallDraft(null);
    setWallEditError("");
  }

  function saveInlineWall() {
    if (!editingWallDraft) return;
    const message = saveWall(
      editingWallDraft.wallAbove,
      editingWallDraft.wallHeight,
      editingWallDraft.wallLength,
      editingWallDraft.spacing,
      editingWallDraft.rodSize,
      editingWallDraft.id,
    );
    if (message) {
      setWallEditError(message);
      return;
    }
    setEditingWallDraft(null);
    setWallEditError("");
  }


  return (
    <div className="fh-module">
      {toolbarHost && createPortal(
        <button
          type="button"
          className="fh-save-framework fh-save-framework-toolbar"
          disabled={readOnly || frameWorkSaveLoading}
          onClick={handleSaveFrameWork}
        >
          {frameWorkSaveLoading ? "Saving..." : "Save Frame Work"}
        </button>,
        toolbarHost
      )}
      <header className="module-heading fh-title-row">
        <div>
          <h1>Frame Hardware</h1>
        </div>
        <div className="fh-title-actions">
          <button
            type="button"
            className="fh-save-framework"
            disabled={readOnly || frameWorkSaveLoading}
            onClick={handleSaveFrameWork}
          >
            {frameWorkSaveLoading ? "Saving..." : "Save Frame Work"}
          </button>
          <button type="button" className="fh-reset" onClick={resetSheet}>
            Reset sheet
          </button>
        </div>
      </header>

      <section className="fh-card">
        <div className="fh-card-title">1. Wall information</div>
        {frameWorkSaveError && <div className="fh-hint error">{frameWorkSaveError}</div>}
        {!frameWorkSaveError && frameWorkSaveMessage && (
          <div className="fh-hint">{frameWorkSaveMessage}</div>
        )}
        <div className="collapsible-subgroup-stack">
          <WallInputGroup
            wallAbove="concrete-slab-floor"
            label="ON CONCRETE SLAB FLOOR"
            onSave={saveWall}
          />
          <WallInputGroup
            wallAbove="timber-floor"
            label="ON TIMBER FLOOR"
            onSave={saveWall}
          />
        </div>
      </section>

      <section className="fh-card">
        <div className="fh-card-title">2. Entered walls</div>
        <div className="fh-table-wrap">
          <table className="fh-table fh-wall-table">
            <colgroup>
              <col className="fh-col-index" /><col className="fh-col-above" /><col className="fh-col-rod-size" />
              <col className="fh-col-height" /><col className="fh-col-length" />
              <col className="fh-col-spacing" /><col className="fh-col-demand" />
              <col className="fh-col-mapping" /><col className="fh-col-actions" />
            </colgroup>
            <thead>
              <tr><th>#</th><th>The Wall Above</th><th>Rod Size</th><th>Wall Height</th><th>Wall Length</th><th>Spacing</th><th>Rod demand</th><th>Rod mapping</th><th /></tr>
            </thead>
            <tbody>
              {walls.map((wall, index) => {
                const editing = editingWallId === wall.id && editingWallDraft?.id === wall.id;
                const current = editing && editingWallDraft ? editingWallDraft : wall;
                const detail = calculation.wallDetails.find((item) => item.id === wall.id);
                return (
                  <tr
                    key={wall.id}
                    className={`ui-editable-row ${editing ? "ui-editing-row" : ""}`}
                    onDoubleClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
                      beginWallEdit(wall);
                    }}
                  >
                    <td>{index + 1}</td>
                    <td>
                      {editing ? (
                        <select value={current.wallAbove} onChange={(event) => setEditingWallDraft({ ...current, wallAbove: event.target.value as WallAbove })}>
                          <option value="concrete-slab-floor">ON CONCRETE SLAB FLOOR</option>
                          <option value="timber-floor">ON TIMBER FLOOR</option>
                        </select>
                      ) : (
                        <span className={`fh-badge ${wall.wallAbove === "concrete-slab-floor" ? "slab" : "timber"}`}>
                          {wall.wallAbove === "concrete-slab-floor" ? "ON CONCRETE SLAB FLOOR" : "ON TIMBER FLOOR"}
                        </span>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select value={current.rodSize} onChange={(event) => setEditingWallDraft({ ...current, rodSize: event.target.value as RodSize })}>
                          <option value="M12">M12</option>
                          <option value="M16">M16</option>
                        </select>
                      ) : wall.rodSize}
                    </td>
                    <td>{editing ? <select value={current.wallHeight} onChange={(event) => setEditingWallDraft({ ...current, wallHeight: num(event.target.value) })}>{HEIGHTS.filter((height) => current.wallAbove === "concrete-slab-floor" || height !== 8800).map((height) => <option key={height} value={height}>{height}</option>)}</select> : <>{wall.wallHeight} mm</>}</td>
                    <td className="fh-number">{editing ? <input inputMode="decimal" value={formatNumber(current.wallLength)} onChange={(event) => /^\d*(?:[.,]\d*)?$/.test(event.target.value) && setEditingWallDraft({ ...current, wallLength: num(event.target.value) })}/> : <>{formatNumber(wall.wallLength)} mm</>}</td>
                    <td>{editing ? <input inputMode="decimal" value={formatNumber(current.spacing)} onChange={(event) => /^\d*(?:[.,]\d*)?$/.test(event.target.value) && setEditingWallDraft({ ...current, spacing: num(event.target.value) })}/> : <>{formatNumber(wall.spacing)} mm</>}</td>
                    <td className="fh-number"><span className="fh-badge auto">{formatNumber(detail?.rodDemand ?? 0)}</span></td>
                    <td>{detail?.rodMapping ?? ""}</td>
                    <td>
                      <div className="ui-row-actions">
                        {editing ? (
                          <>
                            <button type="button" className="ui-row-save" onClick={saveInlineWall} aria-label="Save row" title="Save row">✓</button>
                            <button type="button" className="ui-row-cancel" onClick={cancelWallEdit}>×</button>
                          </>
                        ) : (
                          <button type="button" className="fh-remove" onClick={() => removeWall(wall.id)}>×</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {wallEditError && <div className="fh-hint error">{wallEditError}</div>}
          {!walls.length && <div className="fh-empty">No walls entered. Complete the fields above and select <strong>Add wall</strong>.</div>}
        </div>
      </section>

      <section className="fh-card">
        <div className="fh-card-title">3. Additional hardware - enter only when required</div>
        <div className="fh-extra-grid">
          {([
            ["extra2700", "Extra 2700 Rod"], ["extra3000", "Extra 3000 Rod"], ["extra3600", "Extra 3600 Rod"],
            ["extraNW", "Extra nuts & washers"], ["braceBoard", "Brace boards"],
            ["jamb140", "140x30 Garage jamb"], ["jamb160", "160x30 Garage jamb"],
          ] as Array<[keyof ExtraValues, string]>).map(([key, label]) => (
            <label className="fh-field" key={key}>
              <span>{label}</span>
              <input className="fh-required" type="text" inputMode="decimal" value={extras[key]} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateExtra(key, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <section className="fh-card">
        <div className="fh-card-title">4. Automatic Frame Hardware schedule</div>
        <div className="fh-summary">
          <div className="fh-kpi"><strong>{walls.length}</strong><span>Walls</span></div>
          <div className="fh-kpi"><strong>{formatNumber(calculation.totalLength)}</strong><span>Total lineal metres</span></div>
          <div className="fh-kpi"><strong>{calculation.displayRows.filter((row) => num(row.qty) > 0).length}</strong><span>Active hardware items</span></div>
          <div className="fh-kpi"><strong>{formatNumber(calculation.chemset)}</strong><span>Chemset tubes</span></div>
        </div>
        <div className="fh-status">
          {walls.length ? `Calculated from ${walls.length} wall${walls.length === 1 ? "" : "s"}, total ${formatNumber(calculation.totalLength)} lm.` : "No wall data available for calculation."}
        </div>
        <div className="fh-table-wrap">
          <table className="fh-table fh-output-table">
            <colgroup>
              <col className="fh-output-description" /><col className="fh-output-quantity" />
              <col className="fh-output-unit" /><col className="fh-output-code" />
            </colgroup>
            <thead><tr><th>Description</th><th>Quantity</th><th>Unit</th><th>Code</th></tr></thead>
            <tbody>
              {(calculationStatus === "idle" || calculationStatus === "loading") ? (
                <ScheduleLoadingRow colSpan={4} label="Calculating Frame Hardware schedule" />
              ) : calculation.displayRows
                .filter((row) => num(row.qty) > 0)
                .map((row) => (
                  <tr key={row.item_number}>
                    <td>{row.description}</td>
                    <td className="fh-number fh-qty">{formatNumber(num(row.qty))}</td>
                    <td>{row.unit}</td>
                    <td className="fh-code">{row.item_number}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
