// Shared floor-level DISPLAY helpers used by every "Entered ..." task table
// (Frame Hardware, Lock Up, Insulation, Cladding, Fixout, Flooring & Decking,
// Hebel Flooring, FOW/Plumbing, Power Truss & Braces, Shelving, Timber Posts,
// Eaves & Soffits, Hardies/Fire Walls).
//
// Every one of those files previously carried its own copy of
// LEVEL_SORT_ORDER + getFloorLevelDisplayName (11 near-identical copies).
// That's why sort order / display name / "Level: X" formatting kept
// drifting between tasks. Import from here instead of re-declaring locally.
//
// IMPORTANT: this file only controls how an already-known floor-level CODE
// (GF, FF, SF, ...) is displayed and sorted. It does NOT decide which code a
// wall/entry belongs to — that value comes from normalizeFloorLevel() /
// normalizeFloorLevelCode() in "@/utils/procurementAutoFill" and
// "@/utils/floorLevel". If two different plan pages are showing the same
// level here, the bug is upstream in those two functions, not in this file.

export const LEVEL_SORT_ORDER = {
  GF: 1, "G/F": 1, "GROUND FLOOR": 1, GROUND: 1, "LEVEL 1": 1, "0F": 1,
  FF: 2, "1/F": 2, "1F": 2, "FIRST FLOOR": 2, FIRST: 2, "LEVEL 2": 2,
  SF: 3, "2/F": 3, "2F": 3, "SECOND FLOOR": 3, SECOND: 3, "LEVEL 3": 3,
  TF: 4, "3/F": 4, "3F": 4, "THIRD FLOOR": 4, THIRD: 4, "LEVEL 4": 4,
  "4F": 5, "4/F": 5, "FOURTH FLOOR": 5, FOURTH: 5, "LEVEL 5": 5,
  "5F": 6, "5/F": 6, "FIFTH FLOOR": 6, FIFTH: 6, "LEVEL 6": 6,
  "6F": 7, "6/F": 7, "SIXTH FLOOR": 7, SIXTH: 7, "LEVEL 7": 7,
  "7F": 8, "7/F": 8, "SEVENTH FLOOR": 8, SEVENTH: 8, "LEVEL 8": 8,
  "8F": 9, "8/F": 9, "EIGHTH FLOOR": 9, EIGHTH: 9, "LEVEL 9": 9,
  "9F": 10, "9/F": 10, "NINTH FLOOR": 10, NINTH: 10, "LEVEL 10": 10,
  "10F": 11, "10/F": 11, "TENTH FLOOR": 11, TENTH: 11, "LEVEL 11": 11
};

const DISPLAY_NAME_TABLE = {
  GF: "Ground Floor", "G/F": "Ground Floor", GROUND: "Ground Floor", "GROUND FLOOR": "Ground Floor", "LEVEL 1": "Ground Floor", "0F": "Ground Floor",
  FF: "First Floor", "1/F": "First Floor", "1F": "First Floor", FIRST: "First Floor", "FIRST FLOOR": "First Floor", "LEVEL 2": "First Floor",
  SF: "Second Floor", "2/F": "Second Floor", "2F": "Second Floor", SECOND: "Second Floor", "SECOND FLOOR": "Second Floor", "LEVEL 3": "Second Floor",
  TF: "Third Floor", "3/F": "Third Floor", "3F": "Third Floor", THIRD: "Third Floor", "THIRD FLOOR": "Third Floor", "LEVEL 4": "Third Floor",
  "4F": "Fourth Floor", "4/F": "Fourth Floor", FOURTH: "Fourth Floor", "FOURTH FLOOR": "Fourth Floor", "LEVEL 5": "Fourth Floor",
  "5F": "Fifth Floor", "5/F": "Fifth Floor", FIFTH: "Fifth Floor", "FIFTH FLOOR": "Fifth Floor", "LEVEL 6": "Fifth Floor",
  "6F": "Sixth Floor", "6/F": "Sixth Floor", SIXTH: "Sixth Floor", "SIXTH FLOOR": "Sixth Floor", "LEVEL 7": "Sixth Floor",
  "7F": "Seventh Floor", "7/F": "Seventh Floor", SEVENTH: "Seventh Floor", "SEVENTH FLOOR": "Seventh Floor", "LEVEL 8": "Seventh Floor",
  "8F": "Eighth Floor", "8/F": "Eighth Floor", EIGHTH: "Eighth Floor", "EIGHTH FLOOR": "Eighth Floor", "LEVEL 9": "Eighth Floor",
  "9F": "Ninth Floor", "9/F": "Ninth Floor", NINTH: "Ninth Floor", "NINTH FLOOR": "Ninth Floor", "LEVEL 10": "Ninth Floor",
  "10F": "Tenth Floor", "10/F": "Tenth Floor", TENTH: "Tenth Floor", "TENTH FLOOR": "Tenth Floor", "LEVEL 11": "Tenth Floor"
};

export function getFloorLevelDisplayName(lvl) {
  const raw = String(lvl || "").trim().toUpperCase();
  return DISPLAY_NAME_TABLE[raw] || `${lvl} Floor`;
}

export function sortFloorLevelCodes(levels) {
  return [...levels].sort((a, b) => (LEVEL_SORT_ORDER[a] || 99) - (LEVEL_SORT_ORDER[b] || 99));
}

/**
 * Groups a flat list of entries into [{ level, items }] ordered by floor
 * level (GF, FF, SF, ... first, unknown codes last).
 * getLevel(item) should return the item's raw floor-level code
 * (ideally already normalized via normalizeFloorLevelCode upstream).
 */
export function groupByFloorLevel(list, getLevel) {
  const groups = {};
  (list || []).forEach((item) => {
    const lvl = getLevel(item) || "GF";
    if (!groups[lvl]) groups[lvl] = [];
    groups[lvl].push(item);
  });
  return sortFloorLevelCodes(Object.keys(groups)).map((level) => ({ level, items: groups[level] }));
}
