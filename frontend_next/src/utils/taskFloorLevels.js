export const TASK_FLOOR_CODES = [
  "GF", "FF", "SF", "3F", "4F", "5F", "6F", "7F", "8F", "9F",
  "10F", "11F", "12F", "13F", "14F", "15F"
];

export const TASK_FLOOR_OPTIONS = [
  { value: "GF", label: "Ground Floor (GF)" },
  { value: "FF", label: "First Floor (FF)" },
  { value: "SF", label: "Second Floor (SF)" },
  { value: "3F", label: "Third Floor (3F)" },
  { value: "4F", label: "Fourth Floor (4F)" },
  { value: "5F", label: "Fifth Floor (5F)" },
  { value: "6F", label: "Sixth Floor (6F)" },
  { value: "7F", label: "Seventh Floor (7F)" },
  { value: "8F", label: "Eighth Floor (8F)" },
  { value: "9F", label: "Ninth Floor (9F)" },
  { value: "10F", label: "Tenth Floor (10F)" },
  { value: "11F", label: "Eleventh Floor (11F)" },
  { value: "12F", label: "Twelfth Floor (12F)" },
  { value: "13F", label: "Thirteenth Floor (13F)" },
  { value: "14F", label: "Fourteenth Floor (14F)" },
  { value: "15F", label: "Fifteenth Floor (15F)" }
];

export function floorCodeFromNumber(value) {
  const n = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(n) || n < 0 || n > 15) return null;
  if (n === 0) return "GF";
  if (n === 1) return "FF";
  if (n === 2) return "SF";
  return `${n}F`;
}

export function floorNumberFromCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (code === "GF") return 0;
  if (code === "FF") return 1;
  if (code === "SF") return 2;
  const match = code.match(/^(\d{1,2})F$/);
  const n = match ? Number(match[1]) : NaN;
  return Number.isFinite(n) && n >= 3 && n <= 15 ? n : null;
}

export function normalizeTaskFloorCode(value) {
  if (typeof value === "number") return floorCodeFromNumber(value);
  const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return null;
  const aliases = {
    GROUND: "GF", GROUNDFLOOR: "GF", LEVEL0: "GF", FLOOR0: "GF", "0": "GF", GF: "GF",
    FIRST: "FF", FIRSTFLOOR: "FF", LEVEL1: "FF", FLOOR1: "FF", "1": "FF", FF: "FF",
    SECOND: "SF", SECONDFLOOR: "SF", LEVEL2: "SF", FLOOR2: "SF", "2": "SF", SF: "SF",
    TF: "3F", THIRD: "3F", THIRDFLOOR: "3F"
  };
  if (aliases[raw]) return aliases[raw];
  const match = raw.match(/^(?:LEVEL|FLOOR)?(\d{1,2})F?$/);
  if (match) return floorCodeFromNumber(match[1]);
  return TASK_FLOOR_CODES.includes(raw) ? raw : null;
}

export function normalizeTaskFloorCodes(value, { defaultGF = true } = {}) {
  let source = value;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (trimmed) {
      try { source = JSON.parse(trimmed); } catch { source = trimmed.split(/[;,|]/g); }
    } else source = [];
  }
  if (!Array.isArray(source)) source = source == null ? [] : [source];
  const unique = [];
  source.forEach((item) => {
    const code = normalizeTaskFloorCode(item);
    if (code && !unique.includes(code)) unique.push(code);
  });
  unique.sort((a, b) => (floorNumberFromCode(a) ?? 99) - (floorNumberFromCode(b) ?? 99));
  return unique.length || !defaultGF ? unique : ["GF"];
}

export function flooringTaskId(floorCode) {
  return `flooring_decking::${normalizeTaskFloorCode(floorCode) || "GF"}`;
}

export function parseFlooringTaskId(taskId) {
  const raw = String(taskId || "");
  if (raw === "flooring_decking") return { baseId: "flooring_decking", floorLevel: "GF" };
  const match = raw.match(/^flooring_decking::(.+)$/);
  if (!match) return null;
  const floorLevel = normalizeTaskFloorCode(match[1]);
  return floorLevel ? { baseId: "flooring_decking", floorLevel } : null;
}

export function makeFlooringTaskTabs(baseTab, floors) {
  if (!baseTab) return [];
  return normalizeTaskFloorCodes(floors).map((floorLevel) => {
    const floorNumber = floorNumberFromCode(floorLevel) ?? 0;
    return {
      ...baseTab,
      id: flooringTaskId(floorLevel),
      baseId: "flooring_decking",
      floorLevel,
      floorNumber,
      label: `Floor ${floorLevel}`,
      title: `Flooring & Decking - ${floorLevel}`
    };
  });
}
