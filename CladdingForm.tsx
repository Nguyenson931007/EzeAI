import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowOutputRow, WorkPackFileData } from "../../../types";
import {
  getEmsCladding,
  getUsingFindItems,
  importBunNswActCladdingExcel,
  searchDataFind,
  type BunNswActCladdingImportRow,
} from "../../../api";
import "../styles/CladdingForm.css";
import { publishAiImportStatus } from "../../../ui/aiImportStatus";
import { useCustomerCalculator } from "../../useCustomerCalculator";
import ScheduleLoadingRow from "../../../components/ScheduleLoadingRow";
import { formatInputNumber as fmt, nonNegativeNumber as num } from "../support/normalization";

type Props = {
  data: WorkPackFileData;
  onChange: (data: WorkPackFileData) => void;
  sheetId?: string;
  clientShortName?: string;
  jobId?: string;
};
type Wall = { id: string; height: number; length: number };
type CladdingManualStageRow = {
  item_number: string;
  description: string;
  qty: number;
  unit: string;
};
type FindCodeItem = {
  item_number: string;
  item_description: string;
  unit: string;
};

const LEGACY_WALLS_FIELD = "cladding_walls";
const IMPORT_FILE_FIELD = "cladding_import_file";
const IMPORT_PREVIEW_FIELD = "cladding_import_preview";

const IMPORT_COMMENT_PREFIX = "Cladding Excel import";
const MANUAL_COMMENT_PREFIX = "Cladding manual material";
const MANUAL_STAGED_FIELD = "cladding_manual_staged_rows";

const LEGACY_AUTO_DESCRIPTIONS = new Set([
  "FC CLADDING HARDIFLEX 6MM JH++2400X1200MM 2.88SQM 400171",
  "FC CLADDING HARDIFLEX 6MM JH++2700X1200MM 3.24SQM 400169",
  "FC CLADDING HARDIFLEX 6MM JH++3000X1200MM 3.60SQM 400167",
  "PINE PRIMED FJ DAR H3 LOSP++42X42MM L/M PRIMED",
  "PINE TREATED F7 FJ LOSP H3++66X42MM 5.4M RADIATA PRIMED",
]);

function isEmptyPlaceholderRow(row: WorkflowOutputRow) {
  return !String(row.description ?? "").trim()
    && !String(row.item_number ?? "").trim()
    && num(row.qty) <= 0
    && !String(row.unit ?? "").trim();
}

function parseWalls(value?: string): Wall[] {
  try {
    const parsed = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        id: String(row?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        height: num(row?.height),
        length: num(row?.length),
      }))
      .filter((row) => row.height > 0 && row.length > 0);
  } catch {
    return [];
  }
}


function parsePreview(value?: string): BunNswActCladdingImportRow[] {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


function parseManualStagedRows(value?: string): CladdingManualStageRow[] {
  try {
    const parsed = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((row) => ({
        item_number: String(row?.item_number || "").trim(),
        description: String(row?.description || "").trim(),
        qty: Math.max(1, Math.ceil(num(row?.qty) || 1)),
        unit: String(row?.unit || "EA").trim() || "EA",
      }))
      .filter((row) => row.item_number && row.description);
  } catch {
    return [];
  }
}


export function isBunNswActCladding(sheet = "", name = "", id = "") {
  return [sheet, name, id].some((value) => value.trim().toLowerCase() === "cladding");
}

export default function BunNswActCladdingForm({
  data,
  onChange,
  sheetId = "cladding",
  clientShortName = "",
  jobId = "",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [walls, setWalls] = useState<Wall[]>(() => parseWalls(data.fields[LEGACY_WALLS_FIELD]));
  const [height, setHeight] = useState("");
  const [length, setLength] = useState("");
  const [weatherWrapCode, setWeatherWrapCode] = useState("");

  useEffect(() => {
    getUsingFindItems("BUN-NSW-ACT", "cladding").then((rows) => {
      setWeatherWrapCode(rows.find((row) => row.usage_key === "weather-wrap")?.item_number ?? "");
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const handleAddData = async (event: Event) => {
      const detail = (event as CustomEvent<{ sheetId?: string }>).detail;
      if (detail?.sheetId !== sheetId) return;

      if (!jobId || clientShortName.trim().toUpperCase() !== "BUN-NSW-ACT") {
        publishAiImportStatus({
          sheetId,
          status: "error",
          message: "Select a BUN NSW/ACT job before adding AI data.",
        });
        return;
      }

      publishAiImportStatus({ sheetId, status: "loading", message: "Loading Cladding data..." });
      try {
        const rows = await getEmsCladding(clientShortName, jobId);
        const importedWalls: Wall[] = rows
          .filter((row) => Number(row.wall_height) > 0 && Number(row.wall_length) > 0)
          .map((row) => ({
            id: `ems-cladding-${row.id}`,
            height: Number(row.wall_height),
            length: Number(row.wall_length),
          }));

        // Replace only walls created by the previous Cladding AI import.
        // Manual Add Wall entries remain untouched.
        const manualWalls = walls.filter((wall) => !wall.id.startsWith("ems-cladding-"));
        const nextWalls = [...manualWalls, ...importedWalls];
        setWalls(nextWalls);
        onChange({
          ...data,
          fields: {
            ...data.fields,
            [LEGACY_WALLS_FIELD]: JSON.stringify(nextWalls),
          },
        });

        const skipped = rows.length - importedWalls.length;
        const message = importedWalls.length
          ? `Loaded ${importedWalls.length} current Cladding wall row${importedWalls.length === 1 ? "" : "s"} into the form${skipped ? ` (${skipped} skipped)` : ""}.`
          : "No matching current Cladding data for this job.";
        publishAiImportStatus({
          sheetId,
          status: importedWalls.length ? (skipped ? "warning" : "success") : "warning",
          message,
        });
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Could not load Cladding data.";
        publishAiImportStatus({ sheetId, status: "error", message });
      }
    };

    window.addEventListener("workpack:add-data-ai", handleAddData);
    return () => window.removeEventListener("workpack:add-data-ai", handleAddData);
  }, [clientShortName, data, jobId, onChange, sheetId, walls]);

  const [manualCode, setManualCode] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualSearchField, setManualSearchField] = useState<"code" | "description" | null>(null);
  const [manualResults, setManualResults] = useState<FindCodeItem[]>([]);
  const [manualSelected, setManualSelected] = useState<FindCodeItem | null>(null);
  const [manualQty, setManualQty] = useState("1");
  const [manualSearching, setManualSearching] = useState(false);
  const [manualSearchError, setManualSearchError] = useState("");

  const importRows = useMemo(
    () => parsePreview(data.fields[IMPORT_PREVIEW_FIELD]),
    [data.fields],
  );

  const stagedManualRows = useMemo(
    () => parseManualStagedRows(data.fields[MANUAL_STAGED_FIELD]),
    [data.fields],
  );

  const stagedManualItem = stagedManualRows[0];
  useEffect(() => {
    if (!stagedManualItem) return;
    setManualSelected({
      item_number: stagedManualItem.item_number,
      item_description: stagedManualItem.description,
      unit: stagedManualItem.unit,
    });
    setManualCode(stagedManualItem.item_number);
    setManualDescription(stagedManualItem.description);
    setManualQty(String(Math.max(1, Math.ceil(num(stagedManualItem.qty)))));
    setManualResults([]);
    setManualSearchField(null);
    setManualSearchError("");
  }, [stagedManualItem?.item_number]);

  useEffect(() => {
    if (!manualSearchField) {
      setManualResults([]);
      setManualSearching(false);
      setManualSearchError("");
      return;
    }

    const query = (
      manualSearchField === "code" ? manualCode : manualDescription
    ).trim();

    if (manualSelected) {
      const selectedValue = manualSearchField === "code"
        ? manualSelected.item_number
        : manualSelected.item_description;

      if (query === selectedValue) {
        setManualResults([]);
        setManualSearching(false);
        setManualSearchError("");
        return;
      }
    }

    if (query.length < 2) {
      setManualResults([]);
      setManualSearching(false);
      setManualSearchError("");
      return;
    }

    let cancelled = false;
    setManualSearching(true);
    setManualSearchError("");

    const timer = window.setTimeout(() => {
      searchDataFind("BUN-NSW-ACT", query.slice(0, 100), 20, 0)
        .then((items) => {
          if (!cancelled) setManualResults(items);
        })
        .catch((error) => {
          if (!cancelled) {
            setManualResults([]);
            setManualSearchError(
              error instanceof Error ? error.message : "Could not search FindCode."
            );
          }
        })
        .finally(() => {
          if (!cancelled) setManualSearching(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    manualCode,
    manualDescription,
    manualSearchField,
    manualSelected,
  ]);

  const {
    result: calculation,
    status: calculationStatus,
    error: calculationError,
  } = useCustomerCalculator<{
    totalArea: number;
    weatherWrapQty: number;
    rows: WorkflowOutputRow[];
  }>(
    "BUN-NSW-ACT",
    "cladding",
    { walls },
    { totalArea: 0, weatherWrapQty: 0, rows: [] },
  );

  // Keep the wall-area preview independent of the API calculator. Besides
  // making the result immediate, this prevents a calculator/database failure
  // from leaving a successfully added wall looking like it has zero area.
  const totalArea = useMemo(
    () => walls.reduce((sum, wall) => sum + wall.height * wall.length, 0),
    [walls],
  );
  const weatherWrapQty = calculation.weatherWrapQty;
  const claddingScheduleRows = useMemo(() => {
    const manualRows = data.rows.filter((row) => {
      if (isEmptyPlaceholderRow(row)) return false;
      if (weatherWrapCode && row.item_number === weatherWrapCode) return false;
      if (LEGACY_AUTO_DESCRIPTIONS.has(row.description)) return false;
      return true;
    });
    return [...calculation.rows, ...manualRows];
  }, [calculation.rows, data.rows, weatherWrapCode]);

  useEffect(() => {
    if (calculationStatus !== "ok") return;
    const storedWalls = JSON.stringify(walls);
    const nextFields = {
      ...data.fields,
      [LEGACY_WALLS_FIELD]: storedWalls,
    };

    if (
      data.fields[LEGACY_WALLS_FIELD] === storedWalls
      && JSON.stringify(claddingScheduleRows) === JSON.stringify(data.rows)
    ) return;

    onChange({ ...data, fields: nextFields, rows: claddingScheduleRows });
  }, [
    calculationStatus,
    claddingScheduleRows,
    data,
    onChange,
    walls,
  ]);

  function validNumber(value: string) {
    return /^\d*(?:[.,]\d*)?$/.test(value);
  }

  function addWall() {
    const h = num(height);
    const l = num(length);
    if (!h || !l) return;

    const nextWalls = [
      ...walls,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        height: h,
        length: l,
      },
    ];
    setWalls(nextWalls);
    // Persist the measurement immediately. Previously this only happened after
    // a successful calculator response, so an API error also lost the new wall.
    onChange({
      ...data,
      fields: {
        ...data.fields,
        [LEGACY_WALLS_FIELD]: JSON.stringify(nextWalls),
      },
    });

    setHeight("");
    setLength("");
  }

  function addManualMaterial() {
    if (!manualSelected) return;

    const qty = Math.max(1, Math.ceil(num(manualQty)));
    const code = manualSelected.item_number.trim();
    if (!code) return;

    const rows = [...data.rows];
    const existingIndex = rows.findIndex(
      (row) => row.item_number === code && row.item_number !== weatherWrapCode
    );

    if (existingIndex >= 0) {
      const existing = rows[existingIndex];
      rows[existingIndex] = {
        ...existing,
        qty: Math.ceil(num(existing.qty) + qty),
        unit: existing.unit || manualSelected.unit || "Each",
        comments: String(existing.comments ?? "").startsWith(IMPORT_COMMENT_PREFIX)
          ? `${IMPORT_COMMENT_PREFIX} | manual qty added`
          : MANUAL_COMMENT_PREFIX,
      };
    } else {
      rows.push({
        item_number: code,
        description: manualSelected.item_description,
        qty,
        unit: manualSelected.unit || "Each",
        comments: MANUAL_COMMENT_PREFIX,
      });
    }

    const nextStaged = stagedManualRows[0]?.item_number === code
      ? stagedManualRows.slice(1)
      : stagedManualRows;
    onChange({
      ...data,
      rows,
      fields: {
        ...data.fields,
        [MANUAL_STAGED_FIELD]: JSON.stringify(nextStaged),
      },
    });
    setManualCode("");
    setManualDescription("");
    setManualSearchField(null);
    setManualResults([]);
    setManualSelected(null);
    setManualQty("1");
    setManualSearchError("");
  }

  function useImportDescriptionForManual(description: string) {
    setManualSelected(null);
    setManualResults([]);
    setManualCode("");
    setManualDescription(description);
    setManualSearchField("description");
    setManualQty("1");
    setManualSearchError("");
  }

  function selectManualItem(item: FindCodeItem) {
    setManualSelected(item);
    setManualCode(item.item_number);
    setManualDescription(item.item_description);
    setManualResults([]);
    setManualSearchField(null);
    setManualSearchError("");
  }

  async function importExcel(file: File) {
    setImporting(true);
    setImportError("");

    try {
      const result = await importBunNswActCladdingExcel(file);

      // Replace only the previous rows created by this Cladding Excel import.
      // HardieWrap generated by calculator and any unrelated/manual rows remain.
      const keepRows = data.rows.filter(
        (row) => !String(row.comments ?? "").startsWith(IMPORT_COMMENT_PREFIX),
      );

      // The supplier workbook may repeat the same material for Window / Door /
      // Corner / Abutment. Since its ID Number is intentionally ignored, rows
      // resolving to the same FindCode item are aggregated by matched code.
      const grouped = new Map<string, WorkflowOutputRow>();
      const unmatchedOutputRows: WorkflowOutputRow[] = [];

      for (const row of result.rows) {
        if (row.status !== "matched" || !row.item_number) {
          // Keep unmatched supplier rows in the final Cladding schedule.
          // Code intentionally stays blank and is highlighted for estimator review.
          unmatchedOutputRows.push({
            item_number: "",
            description: row.description,
            qty: num(row.qty),
            unit: row.unit || "Each",
            comments: `${IMPORT_COMMENT_PREFIX} | ${result.file_name} | unmatched`,
          });
          continue;
        }

        const existing = grouped.get(row.item_number);
        if (existing) {
          existing.qty = num(existing.qty) + num(row.qty);
          existing.comments = `${IMPORT_COMMENT_PREFIX} | ${result.file_name} | aggregated source rows`;
          continue;
        }

        grouped.set(row.item_number, {
          item_number: row.item_number,
          // Preserve the supplier calculator description exactly as requested.
          // Only Item Number comes from FindCode.
          description: row.description,
          qty: num(row.qty),
          unit: row.unit || row.matched_unit || "Each",
          comments: `${IMPORT_COMMENT_PREFIX} | ${result.file_name}`,
        });
      }

      onChange({
        ...data,
        fields: {
          ...data.fields,
          [IMPORT_FILE_FIELD]: result.file_name,
          [IMPORT_PREVIEW_FIELD]: JSON.stringify(result.rows),
          [LEGACY_WALLS_FIELD]: JSON.stringify(walls),
        },
        rows: [...keepRows, ...grouped.values(), ...unmatchedOutputRows],
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import Cladding Excel.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const matchedCount = importRows.filter((row) => row.status === "matched").length;
  const unmatchedCount = importRows.filter((row) => row.status === "unmatched").length;
  const manualCount = data.rows.filter((row) =>
    String(row.comments ?? "").startsWith(MANUAL_COMMENT_PREFIX)
  ).length + stagedManualRows.length;

  return (
    <div className="fh-module cladding-module">
      <header className="module-heading fh-title-row">
        <div><h1>Cladding</h1></div>
      </header>

      <section className="fh-card cladding-wall-card">
        <div className="fh-card-title">1. External wall measurements</div>

        <div className="cladding-wall-form">
          <label className="fh-field">
            <span>Wall Height <small>m</small></span>
            <input
              className="fh-required"
              inputMode="decimal"
              placeholder="e.g. 2.44"
              value={height}
              onChange={(event) => validNumber(event.target.value) && setHeight(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addWall()}
            />
          </label>

          <label className="fh-field">
            <span>Wall Length <small>m</small></span>
            <input
              className="fh-required"
              inputMode="decimal"
              placeholder="Enter lineal metres"
              value={length}
              onChange={(event) => validNumber(event.target.value) && setLength(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addWall()}
            />
          </label>

          <button
            type="button"
            className="fh-add-wall cladding-add-wall"
            disabled={!num(height) || !num(length)}
            onClick={addWall}
          >
            + Add wall
          </button>

          <label className="fh-field cladding-area-field">
            <span>Total Area <small>m²</small></span>
            <input value={fmt(totalArea)} readOnly aria-label="Total cladding wall area" />
          </label>
        </div>
        {calculationStatus === "error" && (
          <div className="fh-hint error">
            Wall area was saved, but the material calculator failed: {calculationError}
          </div>
        )}
      </section>

      <section className="fh-card cladding-import-card">
        <div className="fh-card-title">2. Cladding materials</div>

        <div className="cladding-import-toolbar">
          <div className="cladding-import-file">
            <strong>{data.fields[IMPORT_FILE_FIELD] || "No Excel imported"}</strong>
            <span>
              {importRows.length
                ? `${matchedCount} matched · ${unmatchedCount} unmatched`
                : "Import supplier calculator Excel"}
            </span>
          </div>

          <input
            ref={fileInputRef}
            className="cladding-file-input"
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importExcel(file);
            }}
          />

          <button
            type="button"
            className="cladding-import-button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? "Matching..." : "Import Excel"}
          </button>
        </div>

        {importError && <div className="cladding-import-error">{importError}</div>}

        <div className="cladding-manual-block">
          <div className="cladding-manual-heading">
            <div>
              <strong>Add manual material</strong>
              <span>Search FindCode or Description, then enter Qty.</span>
            </div>
            <span className="cladding-manual-count">{manualCount} manual</span>
          </div>

          <div className="cladding-manual-grid">
            <div className="cladding-manual-search-wrap cladding-manual-description">
              <label className="fh-field">
                <span>Description</span>
                <input
                  value={manualDescription}
                  placeholder="e.g. Linea weatherboard 180"
                  autoComplete="off"
                  onFocus={() => setManualSearchField("description")}
                  onChange={(event) => {
                    setManualDescription(event.target.value);
                    setManualSelected(null);
                    setManualSearchField("description");
                  }}
                />
              </label>

              {manualSearchField === "description" && (
                <div className="cladding-findcode-results">
                  {manualSearching && (
                    <div className="cladding-findcode-message">Searching FindCode...</div>
                  )}
                  {!manualSearching && manualSearchError && (
                    <div className="cladding-findcode-message is-error">{manualSearchError}</div>
                  )}
                  {!manualSearching && !manualSearchError && manualResults.map((item) => (
                    <button
                      key={item.item_number}
                      type="button"
                      className="cladding-findcode-result"
                      onClick={() => selectManualItem(item)}
                    >
                      <span className="fh-code">{item.item_number}</span>
                      <strong>{item.item_description}</strong>
                      <small>{item.unit || "Each"}</small>
                    </button>
                  ))}
                  {!manualSearching
                    && !manualSearchError
                    && manualDescription.trim().length >= 2
                    && !manualSelected
                    && manualResults.length === 0 && (
                      <div className="cladding-findcode-message">No FindCode results.</div>
                    )}
                </div>
              )}
            </div>

            <label className="fh-field cladding-manual-qty">
              <span>Qty</span>
              <input
                className="fh-required"
                inputMode="numeric"
                value={manualQty}
                onChange={(event) => /^\d*$/.test(event.target.value) && setManualQty(event.target.value)}
                onBlur={() => setManualQty(String(Math.max(1, Math.ceil(num(manualQty)))))}
              />
            </label>

            <label className="fh-field cladding-manual-unit">
              <span>Unit</span>
              <input
                value={manualSelected?.unit || ""}
                placeholder="Auto"
                readOnly
              />
            </label>

            <div className="cladding-manual-search-wrap cladding-manual-code">
              <label className="fh-field">
                <span>FindCode</span>
                <input
                  value={manualCode}
                  placeholder="e.g. 0403647"
                  autoComplete="off"
                  onFocus={() => setManualSearchField("code")}
                  onChange={(event) => {
                    setManualCode(event.target.value);
                    setManualSelected(null);
                    setManualSearchField("code");
                  }}
                />
              </label>

              {manualSearchField === "code" && (
                <div className="cladding-findcode-results">
                  {manualSearching && (
                    <div className="cladding-findcode-message">Searching FindCode...</div>
                  )}
                  {!manualSearching && manualSearchError && (
                    <div className="cladding-findcode-message is-error">{manualSearchError}</div>
                  )}
                  {!manualSearching && !manualSearchError && manualResults.map((item) => (
                    <button
                      key={item.item_number}
                      type="button"
                      className="cladding-findcode-result"
                      onClick={() => selectManualItem(item)}
                    >
                      <span className="fh-code">{item.item_number}</span>
                      <strong>{item.item_description}</strong>
                      <small>{item.unit || "Each"}</small>
                    </button>
                  ))}
                  {!manualSearching
                    && !manualSearchError
                    && manualCode.trim().length >= 2
                    && !manualSelected
                    && manualResults.length === 0 && (
                      <div className="cladding-findcode-message">No FindCode results.</div>
                    )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="fh-add-wall cladding-add-material"
              disabled={!manualSelected || !num(manualQty)}
              onClick={addManualMaterial}
            >
              + Add cladding
            </button>
          </div>

        </div>

        {importRows.length > 0 && (
          <div className="fh-table-wrap cladding-import-table-wrap">
            <table className="fh-table cladding-import-table">
              <thead>
                <tr>
                  <th>Description from Excel</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>FindCode</th>
                  <th>Matched FindCode description</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {importRows.map((row) => (
                  <tr key={`${row.source_row}-${row.description}`}>
                    <td>{row.description}</td>
                    <td className="fh-number">{fmt(num(row.qty))}</td>
                    <td>{row.unit}</td>
                    <td className="fh-code">{row.item_number || "—"}</td>
                    <td>{row.matched_description || "—"}</td>
                    <td>
                      <span className={`cladding-match-status is-${row.status}`}>
                        {row.status === "matched" ? "Matched" : "Unmatched"}
                      </span>
                    </td>
                    <td className="cladding-import-action">
                      {row.status === "unmatched" && (
                        <button
                          type="button"
                          className="cladding-use-manual"
                          onClick={() => useImportDescriptionForManual(row.description)}
                        >
                          Use manual
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="fh-card">
        <div className="fh-card-title">3. Automatic Cladding schedule</div>

        <div className="fh-summary cladding-summary">
          <div className="fh-kpi"><strong>{fmt(totalArea)}</strong><span>Total wall m²</span></div>
          <div className="fh-kpi"><strong>{weatherWrapQty}</strong><span>HardieWrap rolls</span></div>
          <div className="fh-kpi"><strong>{matchedCount}</strong><span>Excel rows matched</span></div>
          <div className="fh-kpi"><strong>{unmatchedCount}</strong><span>Need review</span></div>
        </div>

        <div className="fh-table-wrap">
          <table className="fh-table fh-output-table cladding-output-table">
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
                <ScheduleLoadingRow colSpan={4} label="Calculating Cladding schedule" />
              ) : claddingScheduleRows.map((row, index) => (
                <tr key={`${row.item_number}-${index}`}>
                  <td>{row.description}</td>
                  <td>{fmt(num(row.qty))}</td>
                  <td>{row.unit}</td>
                  <td className={`fh-code ${!row.item_number ? "cladding-code-missing" : ""}`}>
                    {row.item_number || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {calculationStatus !== "idle" && calculationStatus !== "loading" && !claddingScheduleRows.length && <div className="fh-empty">No active Cladding output items.</div>}
        </div>
      </section>
    </div>
  );
}
