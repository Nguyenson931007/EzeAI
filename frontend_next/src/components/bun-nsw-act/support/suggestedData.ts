import layouts from "./layouts.json";

export type BuiltInSuggestedItem = {
  item_number: string;
  item_description: string;
  unit: string;
};

type LayoutCell = { r: number; c: number; v?: unknown };
type OutputTable = {
  firstRow: number;
  lastRow: number;
  codeColumn: number;
  descriptionColumn: number;
  unitColumn?: number;
  defaultUnit?: string;
};

const OUTPUT_TABLES: Record<string, OutputTable> = {
  "Eaves & Soffits": { firstRow: 10, lastRow: 55, codeColumn: 4, descriptionColumn: 5, unitColumn: 7 },
  Cladding: { firstRow: 10, lastRow: 58, codeColumn: 4, descriptionColumn: 6, unitColumn: 8 },
  "Frame Hardware": { firstRow: 9, lastRow: 31, codeColumn: 6, descriptionColumn: 3, unitColumn: 5 },
  Insulation: { firstRow: 11, lastRow: 35, codeColumn: 5, descriptionColumn: 6, unitColumn: 8 },
  "Flooring & Decking - FF": { firstRow: 11, lastRow: 47, codeColumn: 3, descriptionColumn: 4, unitColumn: 6 },
  "Lock Up": { firstRow: 10, lastRow: 52, codeColumn: 2, descriptionColumn: 3, unitColumn: 8, defaultUnit: "Each" },
  Fixout: { firstRow: 10, lastRow: 79, codeColumn: 1, descriptionColumn: 2, unitColumn: 4 },
  "Final Fit": { firstRow: 9, lastRow: 49, codeColumn: 13, descriptionColumn: 16, defaultUnit: "Each" },
  "Beams & Posts": { firstRow: 9, lastRow: 55, codeColumn: 16, descriptionColumn: 17, defaultUnit: "Each" },
};

const sheetLayouts = layouts.sheets as Record<string, { cells: LayoutCell[] }>;
const SHEET_ALIASES: Record<string, string> = {
  "eaves & soffit": "Eaves & Soffits",
  "eaves and soffit": "Eaves & Soffits",
  "eaves & soffits": "Eaves & Soffits",
  eaves: "Eaves & Soffits",
  lockup: "Lock Up",
  "lock-up": "Lock Up",
  "lock up": "Lock Up",
  "finalfit": "Final Fit",
  "final fit": "Final Fit",
  // Flooring & Decking uses the same suggested-data catalog on every floor.
  "flooring & decking - gf": "Flooring & Decking - FF",
  "flooring & decking - ff": "Flooring & Decking - FF",
  "flooring & decking - sf": "Flooring & Decking - FF",
};

function canonicalSheetName(sheetKey: string) {
  const normalized = sheetKey.trim().toLowerCase().replace(/\s+/g, " ");
  return SHEET_ALIASES[normalized] ?? sheetKey.trim();
}

export function getBunNswActSuggestedItems(sheetKey: string): BuiltInSuggestedItem[] {
  const canonicalName = canonicalSheetName(sheetKey);
  const table = OUTPUT_TABLES[canonicalName];
  const sheet = sheetLayouts[canonicalName];
  if (!table || !sheet) return [];

  const cells = new Map(sheet.cells.map((cell) => [`${cell.r}:${cell.c}`, String(cell.v ?? "").trim()]));
  const unique = new Map<string, BuiltInSuggestedItem>();

  for (let row = table.firstRow; row <= table.lastRow; row += 1) {
    const itemNumber = cells.get(`${row}:${table.codeColumn}`) ?? "";
    const description = cells.get(`${row}:${table.descriptionColumn}`) ?? "";
    if (!/^\d{7}$/.test(itemNumber) || !description) continue;
    unique.set(itemNumber, {
      item_number: itemNumber,
      item_description: description,
      unit: (table.unitColumn ? cells.get(`${row}:${table.unitColumn}`) : "") || table.defaultUnit || "EA",
    });
  }
  return [...unique.values()];
}

/** Product choices embedded on the right side of the Beams & Posts workbook sheet. */
export function getBunNswActPostCatalog(): BuiltInSuggestedItem[] {
  const sheet = sheetLayouts["Beams & Posts"];
  if (!sheet) return [];
  const cells = new Map(sheet.cells.map((cell) => [`${cell.r}:${cell.c}`, String(cell.v ?? "").trim()]));
  const rows: BuiltInSuggestedItem[] = [];
  for (let row = 9; row <= 75; row += 1) {
    const code = cells.get(`${row}:16`) ?? "";
    const description = cells.get(`${row}:17`) ?? "";
    if (/^\d{7}$/.test(code) && description) rows.push({ item_number: code, item_description: description, unit: "Each" });
  }
  return rows;
}
