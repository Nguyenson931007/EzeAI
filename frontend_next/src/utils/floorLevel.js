const LEVEL_NUMBER_CODES = ["GF", "FF", "SF", "TF"];

export function normalizeFloorLevelCode(value, fallback = "GF") {
  const source = String(value ?? fallback).toUpperCase().trim();
  if (!source) return fallback;

  // EzeFloor's persisted page classes are zero-based aliases.
  if (/^(FIRST_FLOOR|GROUND_FLOOR|FLOOR_0|LEVEL_0)$/.test(source)) return "GF";
  if (/^(UPPER_FLOOR|FLOOR_1)$/.test(source)) return "FF";
  if (/^(THIRD_FLOOR|FLOOR_2)$/.test(source)) return "SF";
  if (/^(FOURTH_FLOOR|FLOOR_3)$/.test(source)) return "TF";
  const storedFloor = source.match(/^FLOOR_(\d+)$/);
  if (storedFloor) return LEVEL_NUMBER_CODES[Number(storedFloor[1])] || `${storedFloor[1]}F`;

  const numberedLevel = source.match(/(?:LEVEL\s*:?\s*)+(\d+)\s*$/i);
  if (numberedLevel) {
    const levelNumber = Number(numberedLevel[1]);
    if (levelNumber >= 1 && levelNumber <= LEVEL_NUMBER_CODES.length) {
      return LEVEL_NUMBER_CODES[levelNumber - 1];
    }
    if (levelNumber > LEVEL_NUMBER_CODES.length) return `${levelNumber - 1}F`;
  }

  const raw = source.replace(/^(?:LEVEL\s*:?\s*)+/i, "").trim();
  if (!raw) return fallback;
  if (/^(GF|G\/F|GROUND|GROUND FLOOR|0F)$/.test(raw)) return "GF";
  if (/^(FF|1\/F|FIRST|FIRST FLOOR|1F)$/.test(raw)) return "FF";
  if (/^(SF|2\/F|SECOND|SECOND FLOOR|2F)$/.test(raw)) return "SF";
  if (/^(TF|3\/F|THIRD|THIRD FLOOR|3F)$/.test(raw)) return "TF";

  const code = raw.match(/\b(GF|FF|SF|TF|\d+F)\b/);
  return code?.[1] || fallback;
}
