// Source of truth copied from the current ProcurementApp BUN NSW/ACT forms.
// Keep EzeFloor input presets aligned with ProcurementApp; DB-backed product
// lists still come from /data-find/using scoped by customer + task.

export const PROCUREMENT_TASK_KEYS = Object.freeze({
  frame: "frame-hardware",
  floor: "flooring",
  insulation: "insulation",
  eaves: "eaves-soffits",
  cladding: "cladding",
  lockup: "lock-up",
  shelving: "shelving",
  beams: "beams-posts",
  truss: "power-truss-braces",
  plumbing: "fow-plumbing",
  fixout: "fixout",
  final: "final-fit",
});

export const FRAME_WALL_HEIGHTS = [2440, 2740, 3400, 5200, 5800, 6400, 7000, 8800];

export const LOCKUP_HEIGHTS = ["2040", "2340", "Spec"];
export const LOCKUP_WIDTHS = ["520", "620", "720", "770", "820", "870", "920", "970", "1020", "1200", "Spec"];
export const LOCKUP_THICKNESSES = ["35", "40", "38"];
export const LOCKUP_HUNG = ["Hung A", "Hung B", "Hung CG", "Hung DG", "Hung G", "Pivot Door", "Double Door Set", "RH Pre Hung"];
export const LOCKUP_TYPES = ["Type A", "Type B", "Type CG", "Type DG", "Type G", "Pivot Frame A", "Pivot Frame B", "Steel Frame"];
export const LOCKUP_DOOR_STOPS = ["Cushion", "DS2 with Riser"];
export const LOCKUP_INTERNAL_HUNG = ["RH", "LH", "RH LO", "LH LO", "DBL DOOR SET", "SET of THREE", "SET of FOUR", "SET of SIX", "Set of EIGHT"];
export const LOCKUP_INTERNAL_TYPES = ["Steel Frame", "Ezy Jamb"];
export const LOCKUP_INTERNAL_HOLES = ["HF", "HO"];
export const LOCKUP_INTERNAL_FINISHES = ["CHR", "SCH"];
export const LOCKUP_LOOSE_JAMBS = [
  "Steel Frame",
  "112x19mm 5.4m Loose Jamb",
  "PINE DAR FJ PENCIL ROUND CLEAR++92X18MM 5.4M CLEAR 4 EDGE",
];


// BUN VIC diverges from NSW/ACT in the current ProcurementApp workbook/forms.
// Keep these values isolated so shared EzeFloor task components can switch
// behaviour without making VIC inherit NSW-only validation lists.
export const BUN_VIC_LOCKUP_PARITY = Object.freeze({
  widths: ["520", "620", "720", "770", "820", "870", "920", "1020", "1200", "Spec"],
  thicknesses: ["35", "40", "38"],
  externalThicknesses: ["35", "40"],
  internalJambOrWall: ["70", "90"],
  internalHung: ["LH", "RH", "LH LO", "RH LO", "DBL", "Set of THREE", "Set of FOUR", "Set of SIX", "Set of EIGHT"],
  internalHoles: ["HO", "HL"],
  looseJambs: [
    "Steel Frame",
    "MDF DAR PRIMED++110X18MM 5.4M LOOSE JAMB",
    "MDF DAR PRIMED++92X18MM 5.4M LOOSE JAMB",
  ],
});

export const BUN_VIC_FIXOUT_PARITY = Object.freeze({
  widths: ["320", "370", "420", "460", "520", "570", "620", "720", "770", "820", "870", "920", "1020", "1200", "spec"],
  cavityHeights: ["2040", "2340", "2150", "spec"],
  cavityWidths: ["620", "720", "770", "820", "870", "920", "1020", "1200", "1000", "spec"],
  handing: ["", "LH", "RH", "LH LO", "RH LO", "DBL", "Set of THREE", "Set of FOUR", "Set of SIX", "Set of EIGHT"],
  holes: ["", "HO", "HL"],
});

export const isBunVicCustomer = (customerId = "") =>
  String(customerId || "").trim().toUpperCase() === "BUN-VIC";

export function getLockupParity(customerId = "") {
  if (!isBunVicCustomer(customerId)) {
    return {
      heights: LOCKUP_HEIGHTS,
      widths: LOCKUP_WIDTHS,
      thicknesses: LOCKUP_THICKNESSES,
      externalThicknesses: LOCKUP_THICKNESSES,
      internalJambOrWall: [],
      externalHung: LOCKUP_HUNG,
      internalHung: LOCKUP_INTERNAL_HUNG,
      externalTypes: LOCKUP_TYPES,
      internalTypes: LOCKUP_INTERNAL_TYPES,
      internalHoles: LOCKUP_INTERNAL_HOLES,
      internalFinishes: LOCKUP_INTERNAL_FINISHES,
      looseJambs: LOCKUP_LOOSE_JAMBS,
      doorStops: LOCKUP_DOOR_STOPS,
    };
  }
  return {
    heights: LOCKUP_HEIGHTS,
    widths: BUN_VIC_LOCKUP_PARITY.widths,
    thicknesses: BUN_VIC_LOCKUP_PARITY.thicknesses,
    externalThicknesses: BUN_VIC_LOCKUP_PARITY.externalThicknesses,
    internalJambOrWall: BUN_VIC_LOCKUP_PARITY.internalJambOrWall,
    externalHung: LOCKUP_HUNG,
    internalHung: BUN_VIC_LOCKUP_PARITY.internalHung,
    externalTypes: LOCKUP_TYPES,
    internalTypes: LOCKUP_INTERNAL_TYPES,
    internalHoles: BUN_VIC_LOCKUP_PARITY.internalHoles,
    internalFinishes: LOCKUP_INTERNAL_FINISHES,
    looseJambs: BUN_VIC_LOCKUP_PARITY.looseJambs,
    doorStops: LOCKUP_DOOR_STOPS,
  };
}

export function getFixoutParity(customerId = "") {
  if (!isBunVicCustomer(customerId)) {
    return {
      height: FIXOUT_HEIGHTS,
      width: FIXOUT_WIDTHS,
      cavityHeight: FIXOUT_CAVITY_HEIGHTS,
      cavityWidth: FIXOUT_CAVITY_WIDTHS,
      wallWidth: FIXOUT_WALL_WIDTHS,
      thicks: FIXOUT_THICKNESSES,
      frame: ["None", ...FIXOUT_FRAME_TYPES],
      liftOff: FIXOUT_LIFT_OFF.map((value) => value || "None"),
      handing: FIXOUT_HANDING.map((value) => value || "None"),
      hole: FIXOUT_HOLES.map((value) => value || "None"),
      finish: FIXOUT_FINISHES.map((value) => value || "None"),
      stop: FIXOUT_DOOR_STOPS,
    };
  }
  return {
    height: FIXOUT_HEIGHTS,
    width: BUN_VIC_FIXOUT_PARITY.widths,
    cavityHeight: BUN_VIC_FIXOUT_PARITY.cavityHeights,
    cavityWidth: BUN_VIC_FIXOUT_PARITY.cavityWidths,
    wallWidth: FIXOUT_WALL_WIDTHS,
    thicks: FIXOUT_THICKNESSES,
    frame: ["None", ...FIXOUT_FRAME_TYPES],
    liftOff: FIXOUT_LIFT_OFF.map((value) => value || "None"),
    handing: BUN_VIC_FIXOUT_PARITY.handing.map((value) => value || "None"),
    hole: BUN_VIC_FIXOUT_PARITY.holes.map((value) => value || "None"),
    finish: FIXOUT_FINISHES.map((value) => value || "None"),
    stop: FIXOUT_DOOR_STOPS,
  };
}

export const FIXOUT_HEIGHTS = ["2040", "2340", "spec"];
export const FIXOUT_WIDTHS = ["320", "370", "420", "460", "520", "570", "620", "720", "770", "820", "870", "920", "970", "1020", "1200", "spec"];
export const FIXOUT_CAVITY_HEIGHTS = ["2040", "2340", "2150", "2450", "spec"];
export const FIXOUT_CAVITY_WIDTHS = ["620", "720", "770", "820", "870", "920", "970", "1020", "1200", "1000", "spec"];
export const FIXOUT_WALL_WIDTHS = ["70", "90"];
export const FIXOUT_THICKNESSES = ["35", "38", "40"];
export const FIXOUT_FRAME_TYPES = ["Steel Frame", "Ezy Jamb"];
export const FIXOUT_LIFT_OFF = ["", "LH LO", "RH LO", "PIVOT DOOR"];
export const FIXOUT_HANDING = ["", "RH", "LH", "RH LO", "LH LO", "DBL DOOR SET", "SET of THREE", "SET of FOUR", "SET of SIX", "Set of EIGHT"];
export const FIXOUT_HOLES = ["", "HO", "HF"];
export const FIXOUT_FINISHES = ["", "CHR", "SCH"];
export const FIXOUT_DOOR_STOPS = ["Cushion", "DS2 with Riser", "None"];

export const FIXOUT_FURNITURE = Object.freeze({
  cavity: ["CSD Passage Set", "CSD Privacy Set", "Face Door Passage Set", "Face Door Privacy Set", "None"],
  prehung: ["Passage Set", "Privacy Set", "Dummy Set", "Privacy Dummy", "Passage Dummy", "None"],
  "loose-jamb": ["Passage Set", "Privacy Set", "Dummy Set", "Privacy Dummy", "Passage Dummy", "None"],
});

export const SHELVING_TYPES = ["Robe", "Linen"];
export const SHELVING_SIZES = [
  "1500x450", "1800x450", "2400x450", "3000x450", "3600x450",
  "1500x600", "1800x600", "2400x600", "3000x600", "3600x600",
];

export const POWER_TRUSS_TYPES = ["Column", "Brace"];
export const FINAL_FIT_ENABLED_OPTIONS = ["Yes", "No"];

export const PREHUNG_DOOR_NAMES = [
  "H1 PCM",
  "SCX1 PCM",
  "HAG9",
  "HAG11",
  "LIN1 CLR",
  "HLR240",
  "HLR230",
  "HMC1 PCM",
  "(TBA)",
  "MFHAG12 LEAF",
  "MF30 LEAF PCM UNG",
  "MFHAG9 LEAF",
  "MFHAG11 LEAF",
  "MFHA10 LEAF",
  "MF27 LEAF",
  "MF28 LEAF UNGLAZED",
  "MF34 LEAF",
  "MF26 LEAF",
  "MF1 LEAF PCM",
  "MF1 LEAF SPM",
  "MF6 LEAF",
  "MF29 LEAF PCM",
  "MF18 LEAF",
  "MF19 LEAF UNGLAZED",
  "MF28 LEAF CLEAR",
  "MF30 LEAF PCM CLR",
  "MF19 LEAF CLEAR",
  "MFSOR1 LEAF",
  "HMC7 PCM",
  "HMC2 PCM",
  "HMC9 PCM",
  "HMC4 PCM",
  "HMC8 PCM",
  "HMC10 PCM",
  "SOR12",
  "HAM1",
  "HA5",
  "HA10",
  "HAG14",
  "HAG12",
  "ASC",
  "CAP",
  "H1 SPM",
  "HA40",
  "HA15",
  "HA45",
  "HA4",
  "HAG18",
  "LIN1 CLAM",
  "LIN1 CLR TGH",
  "DEN",
  "HAY",
  "OAK",
  "SOR2",
  "SOR7",
  "SOR1",
  "SOR5",
  "SOR6",
  "SOR11",
  "HAG6",
  "BF30 PCM UNGLAZED",
  "BFHA5",
  "BFHA10",
  "BFHA45",
  "BF28 CLEAR",
  "BF27",
  "BF28 UNGLAZED",
  "BF34",
  "BF26",
  "BF1 PCM",
  "BF1 SPM",
  "BF30 PCM CLEAR",
  "BF6",
  "BF29 PCM",
  "BF19 CLEAR",
  "BF19 UNGLAZED",
  "BF18",
  "SEMI-SOLID CORE",
];

export const LOOSE_JAMB_DOOR_NAMES = [
  "H1 PCM",
  "SCX1 PCM",
  "FBDS1 PCM",
  "HAG9",
  "HAG11",
  "HMC1 PCM",
  "HAG6",
  "HA10",
  "HA15",
  "HA4",
  "HA40",
  "HA5",
  "HAG9 SCX1 PCM",
  "HA45",
  "HAG12",
  "HAG14",
  "HAG18",
  "HA100",
  "HAM10 MDF INFILL",
  "HAM6 CLEAR",
  "HAM10 CLEAR",
  "HAM10 TRANS LAM",
  "HAM6 TRANS LAM",
  "HAM12 MDF INFILL",
  "HAM12 CLEAR",
  "HAM12 TRANS LAM",
  "HAM16 MDF INFILL",
  "HAM16 CLEAR",
  "HAM16 TRANS",
  "HAM16 TRANS LAM",
  "HAM5 CLEAR",
  "HAM6 MDF INFILL",
  "HAM1 CLEAR",
  "HAM1 TRANS LAM",
  "HAM4 MDF INFILL",
  "HAM5 MDF INFILL",
  "HAM5 TRANS LAM",
  "HAM12 TRANS",
  "HAM1 TRANS",
  "HAM4 CLEAR",
  "HAM4 TRANS LAM",
  "HAM1 MDF INFILL",
  "HST5",
  "HST4M",
  "HST1",
  "HST1M",
  "HST4",
  "HMC4 PCM",
  "HMC2 PCM",
  "HMC10 PCM",
  "HMC7 PCM",
  "HMC11 PCM CLEAR",
  "HMC8 PCM",
  "HMC9 PCM",
  "SOR22",
  "SOR8",
  "SOR1",
  "SOR11",
  "SOR2",
  "SOR5",
  "SOR6",
  "SOR7",
  "SOR12",
  "LIN10 SPM CLEAR",
  "LIN1 SPM CLEAR TGH",
  "LIN1 SPM CLEAR LAM",
  "LIN1 SPM CLEAR",
  "LIN10 SPM TRANSLAM",
  "LIN2 SPM",
  "LIN3 SPM UNGLAZED",
  "LIN1 SPM UNGLAZED",
  "LIN10 SPM UNGLAZED",
  "LIN3 SPM CLEAR",
  "HLR230 PCM",
  "HLR210 PCM CLEAR",
  "HLR270 PCM",
  "HLR400 SPM",
  "HLR410 SPM",
  "HLR500 SPM",
  "HLR600 SPM",
  "HLR210 PCM U/G",
  "HLR220 PCM U/G",
  "HLR250 SPM",
  "HLR240 PCM",
  "HLR210 PCM AFRICNA",
  "HLR210 PCM CATHED",
  "HLR210 PCM GRY TNT",
  "HLR210 PCM LIN SAT",
  "HLR210 PCM LIN CLR",
  "HLR210 PCM TRANS",
  "OAK GBR",
  "CAP",
  "DEN",
  "XB2 OAK SOLID",
  "OAK",
  "OAK G UNGLAZED",
  "OAK G CLEAR",
  "ASC",
  "HAY",
  "ASC-G CLEAR",
  "ASC-G UNGLAZED",
  "FBDS3 PCM",
  "FBDS2 PCM",
  "FBDS4 PCM",
  "FBDS5 PCM",
  "FBDU1 PCM",
  "FBDU2 PCM",
  "FBDU3 PCM",
  "FBDU4 PCM",
  "FBDU5 PCM",
  "PCSG 6mm",
  "H1 SPM",
  "H1 PCLC 4.75mm",
  "PCSG 6mm GBR",
  "X1 D/C",
  "X1 SPM",
  "X1 P/PLY",
  "SCX1 D/C",
  "SCX1 P/PLY",
  "SCX1 SPM",
  "STPC P/PLY",
  "STPC D/C",
  "STPC SPM",
  "BF30 PCM UNGLAZED",
  "BFHA5",
  "BFHA10",
  "BFHA45",
  "BF28 CLEAR",
  "BF27",
  "BF28 UNGLAZED",
  "BF34",
  "BF26",
  "BF1 PCM",
  "BF1 SPM",
  "BF30 PCM CLEAR",
  "BF6",
  "BF29 PCM",
  "BF19 CLEAR",
  "BF19 UNGLAZED",
  "BF18",
  "MFHAG12 LEAF",
  "MF30 LEAF PCM UNG",
  "MFHAG9 LEAF",
  "MFHAG11 LEAF",
  "MFHA10 LEAF",
  "MF27 LEAF",
  "MF28 LEAF UNGLAZED",
  "MF34 LEAF",
  "MF26 LEAF",
  "MF1 LEAF PCM",
  "MF1 LEAF SPM",
  "MF6 LEAF",
  "MF29 LEAF PCM",
  "MF18 LEAF",
  "MF19 LEAF UNGLAZED",
  "MF28 LEAF CLEAR",
  "MF30 LEAF PCM CLR",
  "MF19 LEAF CLEAR",
  "MFSOR1 LEAF",
  "PRE9",
  "PRE11",
  "PRE18",
  "PRE40",
  "PRE44",
  "PRE4",
  "(TBA)",
];


// Canonical manual-input contract mirrored from ProcurementApp BUN NSW/ACT.
// This is intentionally UI/data-contract metadata only. It does not write to DB.
export const FIXOUT_SMART_ROBE_HEIGHTS = ["2340", "2040"];
export const FIXOUT_SMART_ROBE_WALLS = ["90", "70"];
export const FIXOUT_FINGER_GRIPS = ["No", "Yes"];
export const FIXOUT_REVEAL_TYPES = ["window", "door"];
export const FIXOUT_BLOCK_WORK = ["No", "Yes"];
export const FIXOUT_ROBE_JAMB_SIZES = ["112x19", "92x19"];
export const FIXOUT_TRIM_DESCRIPTIONS = [
  "To Match Existing 5.4M",
  "MDF DAR PRIMED++42X18MM 5.4M",
  "MDF DAR PRIMED++67X18MM 5.4M",
  "MDF DAR PRIMED++92X18MM 5.4M",
  "PINE PRIMED DAR FJ++42X18MM 5.4M",
  "PINE PRIMED DAR FJ++66X18MM 5.4M",
  "PINE PRIMED DAR FJ++92X18MM 5.4M",
  "MDF MOULDING BEVEL++42X18MM 5.4M PRIMED",
  "MDF MOULDING BEVEL++67X18MM 5.4M PRIMED",
  "MDF MOULDING BEVEL++92X18MM 5.4M PRIMED",
  "MDF MOULDING COLONIAL++42X18MM 5.4M PRIMED",
  "MDF MOULDING COLONIAL++67X18MM 5.4M PRIMED",
  "MDF MOULDING COLONIAL++92X18MM 5.4M PRIMED",
  "MDF MOULDING BULLNOSE++42X18MM 5.4M PRIMED",
  "MDF MOULDING BULLNOSE++67X18MM 5.4M PRIMED",
  "MDF MOULDING BULLNOSE++92X18MM 5.4M PRIMED",
  "MDF MOULDING HALF SPLAYED++67X18MM 5.4M PRIMED",
  "MDF MOULDING HALF SPLAYED++92X18MM 5.4M PRIMED",
  "MDF MOULDING LAMBS TONGUE++67X18MM 5.4M PRIMED",
  "MDF MOULDING LAMBS TONGUE++92X18MM 5.4M PRIMED",
  "spec",
];

export const FRAME_HARDWARE_EXTRA_FIELDS = Object.freeze([
  ["extra2700", "Extra 2700 Rod"],
  ["extra3000", "Extra 3000 Rod"],
  ["extra3600", "Extra 3600 Rod"],
  ["extraNW", "Extra nuts & washers"],
  ["braceBoard", "Brace boards"],
  ["jamb140", "140x30 Garage jamb"],
  ["jamb160", "160x30 Garage jamb"],
]);

// Current ProcurementApp BUN-VIC Frame Hardware is slab-only.  These are the
// only manual extras still present on the VIC workbook form.  `upperFloors`
// is kept in the same JSON payload because it is an Excel input (L10), not an
// entered wall attribute.
export const BUN_VIC_FRAME_HARDWARE_EXTRA_FIELDS = Object.freeze([
  ["upperFloors", "Upper floors"],
  ["extraAnchor", "Extra Anchor"],
  ["extraWasher", "Extra Washer"],
  ["braceBoard", "Brace boards"],
  ["jamb140", "140x30 Garage jamb"],
  ["jamb160", "160x30 Garage jamb"],
]);

export const SHELVING_EXTRA_FIELDS = Object.freeze([
  ["2400x450", "Extra 2400x450mm melamine boards"],
  ["3600x450", "Extra 3600x450mm melamine boards"],
  ["2400x600", "Extra 2400x600mm melamine boards"],
  ["3600x600", "Extra 3600x600mm melamine boards"],
  ["42x18", "Extra 42x18 backs/sides"],
  ["68x18", "Extra 68x18 front lip"],
  ["mullion", "Extra 42x42 centre mullions"],
]);

export const PROCUREMENT_FORM_CONTRACT = Object.freeze({
  fixout: {
    persistedFields: [
      "fixout_doors", "fixout_smart_robe_rows", "fixout_smart_robe_finger_grips",
      "fixout_reveal_openings", "fixout_arch_extra_lengths", "fixout_skirting_lm",
      "fixout_robe_count", "fixout_robe_jamb_size", "fixout_wet_arch_lengths",
      "fixout_wet_skirting_lm", "fixout_arch_description", "fixout_arch_code",
      "fixout_skirting_description", "fixout_skirting_code", "fixout_arch-wet_description",
      "fixout_arch-wet_code", "fixout_skirting-wet_description", "fixout_skirting-wet_code",
    ],
  },
  lockup: { persistedFields: ["lockup_doors"] },
  frame: { persistedFields: ["frame_hardware_walls", "frame_hardware_extras", "frame_hardware_rod_size"] },
  insulation: { persistedFields: ["insulation_wall_entries", "insulation_floor_ceiling_entries"] },
  shelving: { persistedFields: ["shelving_entries", "shelving_extras", "shelving_robe", "shelving_linen"] },
  truss: { persistedFields: ["power_truss_braces_rows"] },
  plumbing: { persistedFields: ["fow_plumbing_rows", "fow_plumbing_quantities", "fow_plumbing_notes"] },
  final: { persistedFields: ["final_fit_enabled"] },
  beams: { persistedFields: ["beams_posts_entries", "beams_posts_post_type", "beams_posts_post_size", "beams_posts_post_key", "beams_posts_post_code", "beams_posts_post_height", "beams_posts_qty"] },
});
