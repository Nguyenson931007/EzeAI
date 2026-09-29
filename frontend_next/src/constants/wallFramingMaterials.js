/**
 * Wall Framing Timber Materials & Dimensions Catalog (EzeX Standard)
 * Extracted from EzeX Assets/Config/jobinfo.combos.json & Wall_Framing_Timber_Materials.txt
 */

export const TIMBER_GRADES = [
  { value: "MGP10", label: "MGP10 (Machine Graded Pine 10 - Standard)" },
  { value: "MGP10 H3", label: "MGP10 H3 (Weather / Treated H3)" },
  { value: "MGP10H2F", label: "MGP10 H2F (Termite Protected)" },
  { value: "MGP12", label: "MGP12 (Higher Strength Pine)" },
  { value: "MGP12H2F", label: "MGP12 H2F (Higher Strength Termite Treated)" },
  { value: "MGP15", label: "MGP15 (High Load Pine)" },
  { value: "MGP15H2F", label: "MGP15 H2F (High Load Termite Treated)" },
  { value: "F7", label: "F7 (Visual Stress Graded Softwood)" },
  { value: "LVL 10", label: "LVL 10 (Laminated Veneer Lumber E10)" },
  { value: "LVL 12", label: "LVL 12 (Laminated Veneer Lumber E12)" },
  { value: "TILLING-LVL13", label: "TILLING-LVL13 (SmartFrame E13)" },
  { value: "DINDAS-LVL", label: "DINDAS-LVL (Engineered Wood)" },
  { value: "WESBEAM-WLVL", label: "WESBEAM-WLVL (Wesbeam E13/E14)" },
  { value: "WLVL H3", label: "WLVL H3 (Wesbeam Treated H3)" },
  { value: "GL15S", label: "GL15S (Glulam Straight)" },
  { value: "GL15C", label: "GL15C (Glulam Cambered)" },
  { value: "STEEL", label: "STEEL (Reinforced Steel Frame)" }
];

export const TREATED_OPTIONS = [
  { value: "UNTREATED", label: "UNTREATED (Standard Indoor)" },
  { value: "H2F TREATED", label: "H2F TREATED (Termite Protected South)" },
  { value: "H2 TREATED", label: "H2 TREATED (Termite Protected Nationwide)" },
  { value: "H3 TREATED", label: "H3 TREATED (Outdoor & Moisture Resistant)" },
  { value: "T2 TREATED", label: "T2 TREATED (Queensland / Tropics)" },
  { value: "LOSP", label: "LOSP (Light Organic Solvent Preservative)" }
];

export const STUD_SPACINGS = [
  { value: "450", label: "450 mm (Standard)", isCommon: true },
  { value: "600", label: "600 mm (Economy / Light)", isCommon: true },
  { value: "300", label: "300 mm" },
  { value: "350", label: "350 mm" },
  { value: "400", label: "400 mm" },
  { value: "200", label: "200 mm" },
  { value: "250", label: "250 mm" },
  { value: "650", label: "650 mm" },
  { value: "800", label: "800 mm" }
];

export const WALL_FRAME_SIZES = {
  70: ["70x35", "70x45"],
  75: ["75x35", "75x45"],
  90: ["90x35", "90x45", "90x63"],
  100: ["100x35", "100x45"],
  110: ["110x35", "110x45"],
  120: ["120x35", "120x45"],
  130: ["130x45", "130x35", "130x63", "130x65", "130x85"],
  140: ["140x35", "140x45", "140x125"],
  150: ["150x45", "150x35", "150x63", "150x75"],
  165: ["165x65", "165x85"],
  170: ["170x35", "170x45", "170x63"],
  190: ["190x35", "190x45"],
  195: ["195x65", "195x85"],
  200: ["200x35", "200x45", "200x63"],
  220: ["220x35", "220x45"],
  230: ["230x65", "230x85"],
  240: ["240x35", "240x45", "240x63"],
  260: ["260x65", "260x85"],
  290: ["290x35", "290x45"],
  295: ["295x65", "295x85"],
  300: ["300x35", "300x45", "300x63", "300x75"],
  330: ["330x65", "330x85"],
  360: ["360x45", "360x63", "360x65", "360x85"],
  395: ["395x65", "395x85"],
  400: ["400x45", "400x63", "400x75"]
};

/**
 * Returns available frame sizes for a given wall thickness in mm
 * @param {number|string} thicknessMm
 * @returns {string[]}
 */
export function getValidFrameSizes(thicknessMm) {
  const t = Math.round(Number(thicknessMm) || 90);
  if (WALL_FRAME_SIZES[t]) {
    return WALL_FRAME_SIZES[t];
  }
  return [`${t}x35`, `${t}x45`];
}

/**
 * Returns default frame size for a given wall thickness in mm
 * @param {number|string} thicknessMm
 * @returns {string}
 */
export function getDefaultFrameSize(thicknessMm) {
  const sizes = getValidFrameSizes(thicknessMm);
  return sizes[0] || `${Math.round(Number(thicknessMm) || 90)}x35`;
}
