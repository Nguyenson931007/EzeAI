import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { polygonAreaM2 } from "@/utils/geometry";

/* ===================================================== */
/* ================= ENTERPRISE BOQ ===================== */
/* ===================================================== */

const formatArea = (v) => {
  if (v == null || v === "") return "";
  const num = Number(v);
  if (isNaN(num)) return v;
  return parseFloat(num.toFixed(2));
};

function normalizeLabel(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z]/g, ""); // ✅ remove all special chars
}

const normalize = (str) =>
  (str || "").toLowerCase().trim();

function normalizeId(id) {
  return String(id)
    .toLowerCase()
    .replace("wall_", "")
    .replace("door_", "")
    .trim();
}

function buildRoomKey(name, wetness, floor) {
  return `${normalize(name)}__${normalize(wetness)}__${normalize(floor)}`;
}

function buildDoorCode(d) {
  const label = d.label || "Door";
  const w = Math.round((d.width || 0.82) * 1000);
  const h = Math.round((d.height || 2.34) * 1000);
  const hinge = d.hinge || "LH";
  return `${label}-${w}x${h}-${hinge}`;
}

function detectDoorSwing(door, walls, page) {
  const wall = walls.find(
    w => normalizeId(w.id) === normalizeId(door.wall_id)
  );
  if (!wall || !wall.points || wall.points.length < 2) {
    return { swing: "unknown", hinge: "unknown" };
  }
  const [p1, p2] = wall.points;
  // vector wall
  const wx = p2[0] - p1[0];
  const wy = p2[1] - p1[1];
  const len = Math.hypot(wx, wy) || 1;
  // normal (2 phía)
  const nx = -wy / len;
  const ny = wx / len;
  const center = door.center || getDoorCenterFromWall(door, walls);
  if (!center) {
    return { swing: "unknown", hinge: "unknown" };
  }
  // test 2 phía
  const testOffset = 40;
  const leftPoint = [
    center[0] + nx * testOffset,
    center[1] + ny * testOffset,
  ];
  const rightPoint = [
    center[0] - nx * testOffset,
    center[1] - ny * testOffset,
  ];
  const leftRoom = findRoomFromCenter(leftPoint, page);
  const rightRoom = findRoomFromCenter(rightPoint, page);
  // 👉 xác định phía "open vào room"
  let openSide = null;
  if (leftRoom && leftRoom.room_name !== "Unnamed") {
    openSide = "left";
  } else if (rightRoom && rightRoom.room_name !== "Unnamed") {
    openSide = "right";
  }
  if (!openSide) {
    return { swing: "unknown", hinge: "unknown" };
  }
  // 👉 xác định hinge (dựa vào hướng wall)
  const wallDir = wx > 0 ? "→" : "←";
  let hinge;
  if (openSide === "left") {
    hinge = wallDir === "→" ? "LH" : "RH";
  } else {
    hinge = wallDir === "→" ? "RH" : "LH";
  }
  return {
    swing: openSide,
    hinge,
  };
}

const doorTypeMap = {
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  livingroom: "Living",
};

const EMPTY_ARRAY = [];

export default function BOQTable({
  pages = EMPTY_ARRAY,
  walls = EMPTY_ARRAY,
  doors = EMPTY_ARRAY,
  scaleValue,
  wasteInternal = 10,
  wasteExternal = 15,
}) {
  const WASTE_FACTOR_INT = 1 + wasteInternal / 100;
  const WASTE_FACTOR_EXT = 1 + wasteExternal / 100;

  const materials = [
    {
      id: "yellow_tng",
      name: "3600x800x19mm Yellow TNG Flooring",
      sheetArea: 2.88,
    },
    {
      id: "yellow_Boa",
      name: "3600x900x22mm Yellow T Particle Board Flooring",
      sheetArea: 3.24,
    },
    {
      id: "scyon_fc",
      name: "Scyon Internal Flooring 2700x600x19mm",
      sheetArea: 1.44,
    },
    {
      id: "deck_merbau_90",
      name: "DECKING MERBAU++90X19MM L/M KD SELECT GRADE",
      sheetArea: 1,
    },
    {
      id: "deck_spotted_gum",
      name: "DECKING SPOTTED GUM++86X19MM L/M KD STD",
      sheetArea: 1,
    },
    {
      id: "deck_merbau_140",
      name: "DECKING MERBAU++140X19MM L/M KD SELECT GRADE",
      sheetArea: 1,
    },
    {
      id: "deck_tile_secura",
      name: "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592 - Tile deck",
      sheetArea: 1.62,
    },
  ];

  const masterMaterials = [
    {
      id: "0148884",
      name: "3600x800x19mm Yellow TNG Flooring",
      mapId: "yellow_tng",
      sheetArea: 2.88,
      unit: "sheet",
    },
    {
      id: "0851522",
      name: "Scyon Internal Flooring 2700x600x19mm",
      mapId: "scyon_fc",
      sheetArea: 1.62,
      unit: "sheet",
    },
    {
      id: "0062735",
      name: "DECKING MERBAU++90X19MM L/M KD SELECT GRADE",
      mapId: "deck_merbau_90",
      sheetArea: 1,
      unit: "L/M",
    },
    {
      id: "0062736",
      name: "DECKING SPOTTED GUM++86X19MM L/M KD STD",
      mapId: "deck_spotted_gum",
      sheetArea: 1,
      unit: "L/M",
    },
    {
      id: "0062737",
      name: "DECKING MERBAU++140X19MM L/M KD SELECT GRADE",
      mapId: "deck_merbau_140",
      sheetArea: 1,
      unit: "L/M",
    },
    {
      id: "0851523",
      name: "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592 - Tile deck",
      mapId: "deck_tile_secura",
      sheetArea: 1.62,
      unit: "sheet",
    },
    {
      id: "1213658",
      name: "Ramset Sausage (1 tube per 4 sheets)",
      type: "ramset",
      unit: "tube",
    },
    {
      id: "0015317",
      name: "Construction Adhesive (1 tube per 10 sheets)",
      type: "adhesive",
      unit: "tube",
    },
    {
      id: "0710706",
      name: "Joint Sealant",
      type: "sealant",
      unit: "tube",
    },
    {
      id: "0443732",
      name: "Construction Adhesive Parfix++300G Maxi Nails",
      sheetArea: 1.62,
      unit: "tube",
    },
  ];

  const enrichedDoors = useMemo(() => {
    return doors.map(d => {
      let center = d.center;
      if (!center) {
        center = getDoorCenterFromWall(d, walls);
      }
      const page = pages[d.page_index];
      if (!center || !page) {
        return {
          ...d,
          center,
          leftRoom: { room_name: d.room_name, wetness: "dry" },
          rightRoom: { room_name: "Unknown", wetness: "dry" },
          floor_name: page?.floor_name || `Floor_${d.page_index ?? 0}`,
        };
      }

      const rooms = findRoomsFromDoor(d, walls, page, center);
      const width = getDoorWidth(d, walls, scaleValue);
      const height = getDoorHeight(d);
      const primaryRoom =
        rooms.left.room_name !== "Unnamed"
          ? rooms.left
          : rooms.right;
      const room = primaryRoom.room_name;
      const wet = primaryRoom.wetness;
      const labelKey = normalizeLabel(primaryRoom.room_name);
      console.log("DOOR DEBUG", {
        id: d.id,
        center,
        left: rooms.left,
        right: rooms.right,
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
        floor_name: page?.floor_name,
      });
      const label = primaryRoom.room_name !== "Unnamed" ? primaryRoom.room_name : "Door";
      const { swing, hinge } = detectDoorSwing(d, walls, page);
      return {
        ...d,
        center,
        leftRoom: rooms.left,
        rightRoom: rooms.right,
        primaryRoom: {
          room_name: primaryRoom.room_name,
          wetness: primaryRoom.wetness
        },
        label,
        swing,
        hinge, // ✅ NEW
        floor_name: page.floor_name,
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
      };
    });
  }, [pages, doors, walls, scaleValue]);

  const doorCountByRoom = useMemo(() => {
    const map = {};
    enrichedDoors.forEach(d => {
      const rooms = [d.leftRoom, d.rightRoom];
      rooms.forEach(r => {
        const key = buildRoomKey(r.room_name, r.wetness, d.floor_name);
        if (!map[key]) map[key] = 0;
        map[key] = (map[key] || 0) + 1;;
      });
    });
    return map;
  }, [enrichedDoors]);

  const baseList = useMemo(() => {
    if (!scaleValue || scaleValue <= 0) return [];
    const rows = [];
    pages.forEach(p =>
      (p.objects || []).forEach((r) => {
        if (!r?.polygon || r.polygon.length < 3) return;
        if (r.id && String(r.id).startsWith("text-")) return;
        const areaCalc = polygonAreaM2(r.polygon, scaleValue);
        if (!areaCalc || areaCalc <= 0) return;
        const roomName = r.room_name || "Uned"; // ✅ define trước
        const roomWetness = r.wetness || "dry";
        const roomKey = buildRoomKey(r.room_name, r.wetness, p.floor_name);
        const doorCount = doorCountByRoom[roomKey] || 0;
        const roomNameLower = (r.room_name || "").toLowerCase();
        const roomTypeLower = (r.type || "").toLowerCase();
        const derivedZone = (roomNameLower.includes("deck") || roomTypeLower.includes("deck"))
          ? "deck"
          : "floor";
        rows.push({
          id: `${p.floor_name}_${roomName}_${roomWetness}`,
          floor_name: p.floor_name,
          room_name: roomName,
          room_wetness: roomWetness,
          zone: derivedZone,
          deckType: r.type === "tile_deck" ? "tile_deck" : "timber_deck",
          areaCalc,
          areaOverride: null,
          doorCount,
        });
      })
    );
    const grouped = {};

    rows.forEach(r => {
      const groupKey = `${r.floor_name}__${r.room_name}__${r.room_wetness}__${r.zone}__${r.deckType || ""}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = { ...r };
      } else {
        grouped[groupKey].areaCalc += r.areaCalc;
      }
    });

    return Object.values(grouped);
  }, [pages, scaleValue, doorCountByRoom]);
  const [viewMode, setViewMode] = useState("detail");
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortDesc, setSortDesc] = useState(true);
  const suggestMaterial = (wetness, zone, deckType) => {
    // Deck
    if (zone === "deck") {
      if (deckType === "tile_deck") {
        return "deck_tile_secura";
      }
      return "deck_merbau_90";
    }
    // Floor trong nhà
    if (zone === "floor") {
      if (wetness === "wet") {
        return "scyon_fc";
      }
      return "yellow_tng";
    }
    return "yellow_Boa";
  };
  useEffect(() => {
    const withSuggestion = baseList.map(r => ({
      ...r,
      materialId: suggestMaterial(r.room_wetness, r.zone, r.deckType)
    }));
    setList(withSuggestion);
  }, [baseList]);
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter, sortDesc]);
  const getArea = r =>
    r.areaOverride != null ? r.areaOverride : r.areaCalc;

  /* ================= Filtering ================= */
  const lockupData = useMemo(() => {
    const map = {};
    enrichedDoors.forEach(d => {
      const room = (
        d.leftRoom?.room_name !== "Unnamed"
          ? d.leftRoom?.room_name
          : d.rightRoom?.room_name
      ) || "Unnamed";
      const wet = d.wetness || "dry";
      const w = Number((d.width ?? 0.82).toFixed(2));
      const h = Number((d.height ?? 2.34).toFixed(2));
      const key =
        buildRoomKey(room, wet, d.floor_name) +
        `_${w}_${h}_${d.hinge}`;
      if (!map[key]) {
        map[key] = {
          room_name: room,
          wetness: wet,
          floor_name: d.floor_name || "No Floor",
          doorCount: 0,
          width: w,
          height: h,
          label: d.label || "Door",
          swing: d.swing || "unknown",
          hinge: d.hinge || "LH",
        };
      }
      map[key].doorCount++;
    });
    return Object.values(map);
  }, [enrichedDoors]);

  const filtered = useMemo(() => {
    return list
      .filter(r =>
        r.room_name.toLowerCase().includes(search.toLowerCase())
      )
      .filter(r =>
        filter === "all" ? true : r.room_wetness === filter
      )
      .sort((a, b) =>
        sortDesc
          ? getArea(b) - getArea(a)
          : getArea(a) - getArea(b)
      );
  }, [list, search, filter, sortDesc]);

  const summaryData = useMemo(() => {
    let totalSheetsAll = 0;
    // ===== YELLOW (Internal) =====
    const yellowMaterial = masterMaterials.find(
      m => m.mapId === "yellow_tng"
    );
    const yellowRows = list.filter(
      r => r.materialId === "yellow_tng"
    );
    const yellowArea = yellowRows.reduce(
      (sum, r) => sum + getArea(r),
      0
    );
    const yellowSheetsRaw = yellowArea / (yellowMaterial?.sheetArea || 2.88);
    const yellowFinalSheets = Math.ceil(yellowSheetsRaw * WASTE_FACTOR_INT);
    totalSheetsAll += yellowFinalSheets;

    // ===== SCYON (Internal) =====
    const scyonMaterial = masterMaterials.find(
      m => m.mapId === "scyon_fc"
    );
    const scyonRows = list.filter(
      r => r.materialId === "scyon_fc"
    );
    const scyonArea = scyonRows.reduce(
      (sum, r) => sum + getArea(r),
      0
    );
    const scyonSheetsRaw = scyonArea / (scyonMaterial?.sheetArea || 1.62);
    const scyonFinalSheets = scyonArea > 10
      ? Math.ceil(scyonSheetsRaw * WASTE_FACTOR_INT + 1)
      : Math.ceil(scyonSheetsRaw * WASTE_FACTOR_INT);
    totalSheetsAll += scyonFinalSheets;
    // ===== DECK (External) =====
    const deckRows = list.filter(r => r.zone === "deck");

    const timberDeckItems = [
      { id: "deck_merbau_90", multiplier: 11.5 },
      { id: "deck_spotted_gum", multiplier: 12.1 },
      { id: "deck_merbau_140", multiplier: 7.7 },
    ];

    const deckSummaries = [];

    // 1. Timber Summaries
    timberDeckItems.forEach(item => {
      const rows = deckRows.filter(r => r.materialId === item.id && r.deckType === "timber_deck");
      if (rows.length === 0) return;

      const rawArea = rows.reduce((sum, r) => sum + getArea(r), 0);
      const roundedArea = Math.ceil(rawArea * 2) / 2;
      const finalQty = Math.ceil(roundedArea * item.multiplier * WASTE_FACTOR_EXT);
      const mat = masterMaterials.find(m => m.mapId === item.id);

      deckSummaries.push({
        id: mat?.id || item.id,
        name: mat?.name || item.id,
        area: roundedArea,
        sheets: "0",
        finalQty,
        unit: "L/M",
      });
    });

    // 2. Tile Deck (Secura)
    let securaFinalSheets = 0;
    const securaRows = deckRows.filter(r => r.materialId === "deck_tile_secura" && r.deckType === "tile_deck");
    if (securaRows.length > 0) {
      const rawArea = securaRows.reduce((sum, r) => sum + getArea(r), 0);
      const roundedArea = Math.ceil(rawArea * 2) / 2;
      const mat = masterMaterials.find(m => m.mapId === "deck_tile_secura");
      securaFinalSheets = Math.ceil(roundedArea / (mat?.sheetArea || 1.62) * 1.25);

      deckSummaries.push({
        id: mat?.id || "0851523",
        name: mat?.name || "FC FLOORING SECURA",
        area: roundedArea,
        sheets: roundedArea / (mat?.sheetArea || 1.62),
        finalQty: securaFinalSheets,
        unit: "sheet",
      });
    }

    // ===== ACCESSORIES =====
    // ✔ Ramset = Yellow / 4
    const ramsetQty = Math.ceil(yellowFinalSheets / 4);
    // ✔ Adhesive (for Yellow) = yellowFinalSheets / 10
    const adhesiveQty = Math.ceil(yellowFinalSheets / 10);
    // ✔ Sealant ví dụ theo tổng sheet / 8
    const sealantQty = Math.ceil((scyonFinalSheets + securaFinalSheets) / 1.2);
    // ✔ Parfix Adhesive (for Scyon/Secura) = (scyon + secura) / 4
    const parfixQty = Math.ceil((scyonFinalSheets + securaFinalSheets) / 4);

    // ===== WALLS (Internal/External) =====
    const wallSummaries = [];
    const internalWalls = (walls || []).filter(w => w.wall_type === "int");
    const externalWalls = (walls || []).filter(w => w.wall_type === "ext");

    const calcWallArea = (wallList) => {
      let totalArea = 0;
      wallList.forEach(w => {
        if (!w.points || w.points.length < 2) return;
        // Calculate length in pixels
        let lengthPx = 0;
        for (let i = 0; i < w.points.length - 1; i++) {
          lengthPx += Math.hypot(w.points[i + 1].x - w.points[i].x, w.points[i + 1].y - w.points[i].y);
        }
        if (w.isClosed && w.points.length > 2) {
          lengthPx += Math.hypot(w.points[0].x - w.points[w.points.length - 1].x, w.points[0].y - w.points[w.points.length - 1].y);
        }

        const lengthM = lengthPx * scaleValue;
        const heightM = (w.height || 2400) / 1000;
        let wallArea = lengthM * heightM;

        // Subtract doors on this wall
        const wallDoors = (doors || []).filter(d => String(d.wall_id) === String(w.id));
        wallDoors.forEach(d => {
          const dWidth = (d.width || 900) / 1000;
          const dHeight = (d.height || 2100) / 1000;
          wallArea -= (dWidth * dHeight);
        });

        totalArea += Math.max(0, wallArea);
      });
      return totalArea;
    };

    const intWallArea = calcWallArea(internalWalls);
    const extWallArea = calcWallArea(externalWalls);

    if (intWallArea > 0) {
      wallSummaries.push({
        id: "WALL_INT",
        name: "Internal Wall Framing & Lining",
        area: intWallArea,
        finalQty: intWallArea,
        unit: "m²",
      });
    }
    if (extWallArea > 0) {
      wallSummaries.push({
        id: "WALL_EXT",
        name: "External Wall Framing & Lining",
        area: extWallArea,
        finalQty: extWallArea,
        unit: "m²",
      });
    }

    return [
      {
        id: yellowMaterial.id,
        name: yellowMaterial.name,
        area: Math.ceil(yellowArea * 2) / 2,
        sheets: yellowSheetsRaw,
        finalQty: yellowFinalSheets,
        unit: "sheet",
      },
      {
        id: scyonMaterial.id,
        name: scyonMaterial.name,
        area: Math.ceil(scyonArea * 2) / 2,
        sheets: scyonSheetsRaw,
        finalQty: scyonFinalSheets,
        unit: "sheet",
      },
      ...deckSummaries,
      ...wallSummaries,
      {
        id: "1213658",
        name: "Ramset Sausage (1 tube per 4 sheets)",
        finalQty: ramsetQty,
        unit: "tube",
      },
      {
        id: "0015317",
        name: "Construction Adhesive (1 tube per 10 sheets)",
        finalQty: adhesiveQty,
        unit: "tube",
      },
      {
        id: "0443732", // có thể đổi thành Tím (mã của bạn)
        name: "Construction Adhesive Parfix++300G Maxi Nails",
        finalQty: parfixQty,
        unit: "tube",
      },
      {
        id: "0710706",
        name: "Joint Sealant",
        finalQty: sealantQty,
        unit: "tube",
      }
    ];
  }, [list, wasteInternal, wasteExternal]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 8;
  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, currentPage]);
  const totalDry = list
    .filter(r => r.room_wetness === "dry")
    .reduce((s, r) => s + getArea(r), 0);
  const totalWet = list
    .filter(r => r.room_wetness === "wet")
    .reduce((s, r) => s + getArea(r), 0);
  const totalAll = totalDry + totalWet;
  /* ================= Inline Edit ================= */
  const updateDeckType = (id, deckType) => {
    setList(prev =>
      prev.map(r =>
        r.id === id
          ? {
            ...r,
            deckType,
            // Auto-update suggestion when type switches
            materialId: suggestMaterial(r.room_wetness, r.zone, deckType)
          }
          : r
      )
    );
  };

  const updateArea = (id, value) => {
    setList(prev =>
      prev.map(r =>
        r.id === id
          ? {
            ...r,
            areaOverride:
              value === "" ? null : parseFloat(value)
          }
          : r
      )
    );
  };

  const updateMaterial = (id, materialId) => {
    setList(prev =>
      prev.map(r =>
        r.id === id
          ? { ...r, materialId }
          : r
      )
    );
  };

  function getDoorWidth(door, walls, scaleValue) {
    const wall = walls.find(
      w => normalizeId(w.id) === normalizeId(door.wall_id)
    );

    if (!wall || !wall.points || wall.points.length < 2) return 0;

    const [p1, p2] = wall.points;

    const wallLengthPx = Math.hypot(
      p2[0] - p1[0],
      p2[1] - p1[1]
    );

    // 👉 convert sang mét
    const wallLengthM = wallLengthPx * scaleValue;

    return (door.widthRatio || 0.1) * wallLengthM;
  }

  function getDoorHeight(door) {
    return door.height || 2.1; // default 2.1m
  }

  function getDoorCenterFromWall(door, walls) {
    const wall = walls.find(
      w => normalizeId(w.id) === normalizeId(door.wall_id)
    );
    if (!wall) {
      console.warn("⚠️ Wall not found for door:", door.id, door.wall_id);
      return null;
    }
    if (!wall.points || wall.points.length < 2) return null;
    const [p1, p2] = wall.points;
    const x = p1[0] + (p2[0] - p1[0]) * door.t;
    const y = p1[1] + (p2[1] - p1[1]) * door.t;
    return [x, y];
  }

  function pointInPolygon(point, vs) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function fallback(page) {
    return {
      room_name: page.floor_name || `Floor_${page.page_index ?? 0}`,
      wetness: "dry",
    };
  }

  function findRoomsFromDoor(door, walls, page, center) {
    const wall = walls.find(
      w => normalizeId(w.id) === normalizeId(door.wall_id)
    );

    if (!wall || !center || !page) {
      return {
        left: fallback(page),
        right: fallback(page),
      };
    }

    const [p1, p2] = wall.points;

    // vector wall
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    // normal vector (vuông góc)
    const nx = -dy / len;
    const ny = dx / len;

    // test nhiều khoảng offset
    const offsets = [20, 40, 60, 80];

    let leftRoom = null;
    let rightRoom = null;

    for (const off of offsets) {
      const leftPoint = [
        center[0] + nx * off,
        center[1] + ny * off,
      ];

      const rightPoint = [
        center[0] - nx * off,
        center[1] - ny * off,
      ];

      for (const o of page.objects || []) {
        if (!o.polygon) continue;

        if (!leftRoom && pointInPolygon(leftPoint, o.polygon)) {
          leftRoom = o;
        }

        if (!rightRoom && pointInPolygon(rightPoint, o.polygon)) {
          rightRoom = o;
        }
      }

      if (leftRoom && rightRoom) break;
    }

    // fallback nếu không tìm được
    const safeLeft = leftRoom || fallback(page);
    const safeRight = rightRoom || fallback(page);

    return {
      left: {
        room_name: safeLeft.room_name || "Unnamed",
        wetness: safeLeft.wetness || "dry",
      },
      right: {
        room_name: safeRight.room_name || "Unnamed",
        wetness: safeRight.wetness || "dry",
      },
    };
  }
  function DetailTable({ title, data, startIndex = 0 }) {
    if (data.length === 0) return null;
    return (
      <div style={{ marginBottom: 30 }}>
        <h4 style={{ marginBottom: 10, color: "#4b5563", fontSize: 14, textTransform: "uppercase" }}>{title}</h4>
        <table style={styles.summaryTable}>
          <thead style={styles.summaryHead}>
            <tr>
              <th style={{ ...styles.th, textAlign: "center" }}>#</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Room</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Type</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Material</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Wetness</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Area (m²)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={`${r.room_name}_${r.room_wetness}_${r.floor_name}_${i}`}>
                <td style={{ ...styles.td, ...styles.tdCenter }}>{startIndex + i + 1}</td>
                <td style={{ ...styles.td, ...styles.tdLeft }}>{r.room_name}</td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>
                  {r.zone === "deck" ? (
                    <select
                      value={r.deckType || "timber_deck"}
                      onChange={(e) => updateDeckType(r.id, e.target.value)}
                      style={styles.inlineInput2}
                    >
                      <option value="timber_deck">Timber</option>
                      <option value="tile_deck">Tile</option>
                    </select>
                  ) : "-"}
                </td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
                    <select
                      value={r.materialId || ""}
                      onChange={(e) => updateMaterial(r.id, e.target.value)}
                      style={styles.inlineInput}
                    >
                      {materials
                        .filter(m => {
                          if (r.zone === "deck") {
                            if (r.deckType === "tile_deck") return m.id === "deck_tile_secura";
                            return m.id.startsWith("deck_") && m.id !== "deck_tile_secura";
                          }
                          return !m.id.startsWith("deck_");
                        })
                        .map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))
                      }
                    </select>
                    {r.materialId === suggestMaterial(r.room_wetness, r.zone, r.deckType) && (
                      <span style={styles.aiBadge}>AI</span>
                    )}
                  </div>
                </td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>{r.room_wetness}</td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>
                  <input
                    type="number"
                    value={formatArea(getArea(r)) ?? ""}
                    onChange={e => updateArea(r.id, Number(e.target.value))}
                    style={styles.inlineInput2}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function LockUpTable({ data }) {
    return (
      <table style={styles.summaryTable}>
        <thead style={styles.summaryHead}>
          <tr>
            <th style={{ ...styles.th, textAlign: "left" }}>#</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Label</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Height</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Width</th>
            <th style={{ ...styles.th, textAlign: "center" }}>QTY</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Ex jamb size</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Frame</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Swing</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Jamp type</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Door type</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Code</th>
            <th style={{ ...styles.th, textAlign: "center" }}>Hardware type</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={`${r.room_name}_${r.room_wetness}_${r.floor_name}_${i}`} style={styles.rowHover}>
              <td style={{ ...styles.td, ...styles.tdCenter }}>{i + 1}</td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                {r.room_name}
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={styles.inlineInput2}>'
                  <option value="">{r.height}</option>
                  <option value="">2040</option>
                  <option value="">2340</option>
                  <option value="">spec</option>
                </select>
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={{ ...styles.inlineInput2 }}>'
                  <option value="">{r.width}</option>
                  <option value="">720</option>
                  <option value="">770</option>
                  <option value="">820</option>
                  <option value="">870</option>
                  <option value="">920</option>
                  <option value="">1200</option>
                  <option value="">spec</option>
                </select>

              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>

                {r.doorCount ?? 0}
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={{ ...styles.inlineInput }}>'
                  <option value="">Door Frame Pre-Made With Sill</option>
                  <option value="">Door Frame Pre-Made With Sill - Pivot Frame</option>
                  <option value="">110x19 MDF Jamb Sets RH</option>
                  <option value="">110x19 MDF Jamb Sets LH</option>
                </select>
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={styles.inlineInput2}>'
                  <option value="">37mm Frame</option>
                  <option value="">42mm Frame</option>
                  <option value="">sets</option>
                </select>
              </td>
              <td>{buildDoorCode(r)}</td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                <select name="" id="" style={styles.inlineInput2}>'
                  <option value="">Single</option>
                  <option value="">Double</option>
                </select>
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                0
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                0
              </td>
              <td style={{ ...styles.td, ...styles.tdCenter }}>
                Lockwood Satin Chrome Symmetry Entry Lever Set - 4020475
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function SummaryTable({ title, data }) {
    if (data.length === 0) return null;
    return (
      <div style={{ marginBottom: 30 }}>
        <h4 style={{ marginBottom: 10, color: "#4b5563", fontSize: 14, textTransform: "uppercase" }}>{title}</h4>
        <table style={styles.summaryTable}>
          <thead style={styles.summaryHead}>
            <tr>
              <th style={styles.th}>STT</th>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Material</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Area (m²)</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Sheets Raw</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Final Qty</th>
              <th style={styles.th}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.id} style={styles.rowHover}>
                <td style={{ ...styles.td, ...styles.tdCenter }}>{i + 1}</td>
                <td style={{ ...styles.td, ...styles.tdCenter }}>{r.id}</td>
                <td style={styles.td}>{r.name}</td>
                <td style={{ ...styles.td, ...styles.tdRight }}>{formatArea(r.area) || "0"}</td>
                <td style={{ ...styles.td, ...styles.tdRight }}>{formatArea(r.sheets) || "0"}</td>
                <td style={{ ...styles.td, ...styles.tdRight }}>{r.finalQty}</td>
                <td style={styles.td}>{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* ================= CSV Export ================= */

  const exportCSV = () => {
    const header = "Room,Material,Wetness,Area\n";

    const rows = list
      .map(r => {
        const material = materials.find(
          m => m.id === r.materialId
        );

        return `${r.room_name},${material?.name || "3600x800x19mm GP Yellow TNG Flooring"
          },${r.room_wetness},${formatArea(getArea(r))}`;
      })
      .join("\n");

    const blob = new Blob([header + rows], {
      type: "text/csv",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "boq.csv";
    a.click();
  };

  /* ================= EXCEL Export (ezequote template) ================= */

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = {};

    // Cell writer helpers
    let rowIdx = 0;
    const s = (r, c, v) => {                     // string cell
      const addr = XLSX.utils.encode_cell({ r, c });
      ws[addr] = { v: String(v ?? ""), t: "s" };
    };
    const n = (r, c, v) => {                     // number cell
      const addr = XLSX.utils.encode_cell({ r, c });
      const num = Number(v);
      ws[addr] = { v: isNaN(num) ? 0 : num, t: "n" };
    };

    // ── Row 0: Job Number
    s(0, 0, "Job Number"); s(0, 1, "");
    // ── Row 1: Job Address
    s(1, 0, "Job Address"); s(1, 1, "");
    // ── Row 2: blank
    // ── Row 3: Title
    s(3, 0, "Flooring & Decking");
    // ── Row 4: blank
    // ── Row 5: Column headers
    s(5, 0, "Product ID");
    s(5, 1, "Material");
    s(5, 2, "Qty");
    s(5, 3, "Unit");
    s(5, 4, "Notes");

    let r = 6;

    // ── Section 1: Yellow TNG
    summaryData
      .filter(row => row.id === "0148884")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "Sheets");
        s(r, 4, "Sheet Floor to Dry Areas Only");
        r++;
      });

    // ── Ramset Sausage
    summaryData
      .filter(row => row.id === "1213658")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "Tubes");
        s(r, 4, "");
        r++;
      });

    r++; // blank row

    // ── Section 2: Scyon
    summaryData
      .filter(row => row.unit === "sheet" && row.id !== "0148884")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "Sheets");
        s(r, 4, "");
        r++;
      });

    // ── Construction Adhesive + Joint Sealant + Parfix
    summaryData
      .filter(row => row.id === "0015317" || row.id === "0710706" || row.id === "0443732")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "Tubes");
        s(r, 4, "");
        r++;
      });

    r++; // blank row

    // ── Section 3: T+G Hardwood (placeholder)
    s(r, 0, "0071016"); s(r, 1, "85x19 T+G Hardwood Flooring"); n(r, 2, 0); s(r, 3, "Lm"); s(r, 4, "Over Sheet Floor"); r++;
    s(r, 0, "0073217"); s(r, 1, "130x18 T+G Hardwood Flooring"); n(r, 2, 0); s(r, 3, "Lm"); s(r, 4, "Over Sheet Floor"); r++;

    r++; // blank row

    // ── Section 4: Merbau Decking (m2)
    summaryData
      .filter(row => row.unit === "m\u00b2" || row.unit === "m2")
      .forEach(row => {
        s(r, 0, row.id);
        s(r, 1, row.name);
        n(r, 2, row.finalQty);
        s(r, 3, "m2");
        s(r, 4, "");
        r++;
      });


    r++; // blank row

    // ── Section 5: Accessories

    s(r, 0, "0080066"); s(r, 1, "Floor Joist Packers 70x45 MGP 10 T2"); n(r, 2, 0); s(r, 3, "m2"); s(r, 4, ""); r++;

    // ── Worksheet range
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r, c: 4 } });

    // ── Column widths
    ws["!cols"] = [
      { wch: 12 }, // A: Product ID
      { wch: 46 }, // B: Material
      { wch: 8 }, // C: Qty
      { wch: 8 }, // D: Unit
      { wch: 32 }, // E: Notes
    ];

    // ── Merge "Flooring & Decking" title (row 3, A:E)
    ws["!merges"] = [
      { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Area Summary");

    // ── Write file via Blob (browser-safe)
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const wastePercent = wasteInternal || 10;
    a.download = `BOQ_Area_Summary_${wastePercent}pct_waste.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!scaleValue || scaleValue <= 0)
    return (
      <div style={styles.card}>
        <h3>📊 BOQ – Floor Area</h3>
        <p style={{ color: "#666" }}>📐 Please set scale using the Measure tool first to calculate areas.</p>
      </div>
    );

  return (
    <div style={styles.card}>
      <h3 style={{ marginBottom: 20 }}>BOQ – Enterprise</h3>

      {/* KPI */}
      <div style={styles.kpiRow}>
        <KPI label="Dry Area" value={totalDry} />
        <KPI label="Wet Area" value={totalWet} />
        <KPI label="Total Area" value={totalAll} highlight />
      </div>

      {/* Chart */}
      <BarChart dry={totalDry} wet={totalWet} />

      {/* Controls */}
      <div style={styles.controls}>
        <input
          placeholder="Search room..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={styles.input}
        />

        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={styles.input}
        >
          <option value="all">All</option>
          <option value="dry">Dry</option>
          <option value="wet">Wet</option>
        </select>

        <button
          onClick={() => setSortDesc(!sortDesc)}
          style={styles.button}
        >
          Sort {sortDesc ? "↓" : "↑"}
        </button>

        <button onClick={exportCSV} style={styles.buttonDark}>
          Export CSV
        </button>
        <button
          onClick={exportExcel}
          style={{
            ...styles.buttonDark,
            background: "#16a34a",
            marginLeft: 8,
          }}
          title="Export Area Summary to Excel (ezequote format)"
        >
          📊 Export Excel
        </button>
      </div>

      <div style={styles.tabBar}>
        <button
          onClick={() => setViewMode("detail")}
          style={{
            ...styles.tabBtn,
            background:
              viewMode === "detail" ? "#111827" : "white",
            color:
              viewMode === "detail" ? "white" : "#111827",
          }}
        >
          Floor List
        </button>

        <button
          onClick={() => setViewMode("summary")}
          style={{
            ...styles.tabBtn,
            background:
              viewMode === "summary" ? "#111827" : "white",
            color:
              viewMode === "summary" ? "white" : "#111827",
          }}
        >
          Area Summary
        </button>
        <button
          onClick={() => setViewMode("Lock_up")}
          style={{
            ...styles.tabBtn,
            background:
              viewMode === "Lock_up" ? "#111827" : "white",
            color:
              viewMode === "Lock_up" ? "white" : "#111827",
          }}
        >
          Lock_up
        </button>
      </div>
      <br />
      {viewMode === "detail" && (
        <>
          <DetailTable
            title="Internal Floor Rooms"
            data={paginatedData.filter(r => r.zone !== "deck")}
            startIndex={(currentPage - 1) * rowsPerPage}
          />
          <DetailTable
            title="External Decks"
            data={paginatedData.filter(r => r.zone === "deck")}
            startIndex={(currentPage - 1) * rowsPerPage}
          />
        </>
      )}

      {viewMode === "summary" && (
        <>
          <SummaryTable
            title="Internal Area Summary"
            data={summaryData.filter(r => (r.unit === "sheet" && r.id !== "0851523") || r.unit === "tube")}
          />
          <SummaryTable
            title="External Deck Summary"
            data={summaryData.filter(r => r.unit === "L/M" || r.id === "0851523")}
          />
        </>
      )}

      {viewMode === "Lock_up" && (
        <LockUpTable data={lockupData} />
      )}

      <div style={styles.paginationWrapper}>
        <div>
          Showing{" "}
          {(currentPage - 1) * rowsPerPage + 1}–
          {Math.min(currentPage * rowsPerPage, filtered.length)}{" "}
          of {filtered.length} rows
        </div>

        <div style={styles.pagination}>

          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(1)}
            style={styles.pageBtn}
          >
            ⏮
          </button>

          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            style={styles.pageBtn}
          >
            ◀
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .slice(
              Math.max(0, currentPage - 3),
              Math.min(totalPages, currentPage + 2)
            )
            .map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                style={{
                  ...styles.pageBtn,
                  background:
                    page === currentPage ? "#111827" : "white",
                  color:
                    page === currentPage ? "white" : "#111827",
                }}
              >
                {page}
              </button>
            ))}

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            style={styles.pageBtn}
          >
            ▶
          </button>

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(totalPages)}
            style={styles.pageBtn}
          >
            ⏭
          </button>

        </div>
      </div>
    </div>
  );
}

/* ================= Components ================= */

function KPI({ label, value, highlight }) {
  return (
    <div
      style={{
        ...styles.kpi,
        background: highlight ? "#111827" : "#f3f4f6",
        color: highlight ? "white" : "#111827",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>
        {formatArea(value)} m²
      </div>
    </div>
  );
}

function BarChart({ dry, wet }) {
  const max = Math.max(dry, wet, 1);

  return (
    <div style={styles.chart}>
      <div>
        <div>Dry</div>
        <div
          style={{
            height: 10,
            width: `${(dry / max) * 100}%`,
            background: "#60a5fa",
            borderRadius: 6,
          }}
        />
      </div>
      <div>
        <div>Wet</div>
        <div
          style={{
            height: 10,
            width: `${(wet / max) * 100}%`,
            background: "#f59e0b",
            borderRadius: 6,
          }}
        />
      </div>
    </div>
  );
}

/* ================= Styles ================= */

const styles = {
  card: {
    marginTop: 40,
    padding: 30,
    background: "white",
    borderRadius: 16,
    boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
    color: "#111827",

  },
  kpiRow: {
    display: "flex",
    gap: 20,
    marginBottom: 20,
  },
  kpi: {
    flex: 1,
    padding: 20,
    borderRadius: 12,
  },
  chart: {
    marginBottom: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  controls: {
    display: "flex",
    gap: 10,
    marginBottom: 20,
  },
  input: {
    padding: 8,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
  },
  inlineInput: {
    width: 200,
    padding: 6,
    borderRadius: 6,
    border: "1px solid #e5e7eb",
  },
  inlineInput2: {
    width: 80,
    padding: 6,
    borderRadius: 6,
    border: "1px solid #e5e7eb",
  },
  button: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    cursor: "pointer",
    color: "#111827",
  },
  buttonDark: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "#111827",
    color: "white",
    border: "none",
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },

  aiBadge: {
    background: "#111827",
    color: "white",
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 6,
  },

  warningBadge: {
    background: "#ef4444",
    color: "white",
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 6,
  },

  paginationWrapper: {
    marginTop: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  pagination: {
    display: "flex",
    gap: 6,
  },

  pageBtn: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    color: "#111827",
  },

  summaryTable: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#f9fafb",
    borderRadius: 12,
    overflow: "hidden",
  },

  summaryHead: {
    background: "#e5e7eb",
  },

  th: {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    borderBottom: "1px solid #d1d5db",
  },

  td: {
    padding: "8px 12px",
    borderBottom: "1px solid #e5e7eb",
    fontSize: 14,
  },

  tdCenter: {
    textAlign: "center",
  },

  tdRight: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },

  rowHover: {
    transition: "0.2s ease",
  },
};