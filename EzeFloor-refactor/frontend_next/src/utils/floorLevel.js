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

export function getArchitecturalPageIndices(pages = []) {
  return (pages || [])
    .map((page, pageIndex) => ({ page, pageIndex }))
    .filter(({ page }) => !page?.category
      && page?.source !== "pdf_tools"
      && !page?.isFloorCeilingWorkspace
      && page?.source !== "floor_ceiling_workspace"
      && page?.source !== "floor_ceiling_page"
      && !page?.isWorkspace)
    .map(({ pageIndex }) => pageIndex);
}

/**
 * Resolve the floor code exactly the same way the left LEVEL rail presents
 * architectural pages: explicit persisted code first, then architectural
 * order.  This is the shared source of truth for every task table.
 */
export function buildArchitecturalFloorLevelMap(pages = []) {
  const pageIndices = getArchitecturalPageIndices(pages);
  const result = new Map();
  const used = new Set();

  pageIndices.forEach((pageIndex, architecturalOrder) => {
    const page = pages?.[pageIndex] || {};
    const fallback = LEVEL_NUMBER_CODES[architecturalOrder] || `${architecturalOrder}F`;
    const explicit = normalizeFloorLevelCode(
      page?.code || page?.levelCode || page?.level_code || page?.floorCode || page?.floor_code || "",
      "",
    );

    // Persisted imports from older builds sometimes copied GF onto every page.
    // Never allow that stale duplicate to collapse two architectural pages into
    // one task-table level.  The left rail already distinguishes pages by order.
    const candidate = explicit || normalizeFloorLevelCode(page?.floor_name || page?.name || "", fallback);
    const level = candidate && !used.has(candidate) ? candidate : fallback;
    result.set(pageIndex, level);
    used.add(level);
  });

  return result;
}

export function resolvePageFloorLevel(pages = [], pageIndex = 0) {
  const map = buildArchitecturalFloorLevelMap(pages);
  if (map.has(Number(pageIndex))) return map.get(Number(pageIndex));
  return normalizeFloorLevelCode(pages?.[pageIndex]?.code || pages?.[pageIndex]?.floor_name || pages?.[pageIndex]?.name, "GF");
}

/** Prefer an object's explicit level metadata, otherwise resolve from its page. */
export function resolveObjectFloorLevel(item, pages = [], pageIndex = 0) {
  // A wall copied into the Floor & Ceiling workspace can deliberately carry a
  // source level that differs from the workspace page. That metadata is the
  // strongest signal.
  const sourceExplicit = item?.sourceLevelCode || item?.source_level_code || item?.levelCode || item?.level_code;
  if (sourceExplicit) return normalizeFloorLevelCode(sourceExplicit, resolvePageFloorLevel(pages, pageIndex));

  // For a normal architectural page, page identity is more reliable than a
  // stale object.floorLevel left over from an older UI/autofill build.
  const pageMap = buildArchitecturalFloorLevelMap(pages);
  if (pageMap.has(Number(pageIndex))) return pageMap.get(Number(pageIndex));

  const explicit = item?.floorLevel || item?.floor_level;
  if (explicit) return normalizeFloorLevelCode(explicit, "GF");
  return resolvePageFloorLevel(pages, pageIndex);
}

