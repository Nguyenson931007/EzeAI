/**
 * TrussEngine.js
 * =============================================================================
 * EzeFloor V3 CAD Engine - Roof Truss Layout, Geometry, and BOQ Calculator
 * =============================================================================
 */

export const TRUSS_TYPES = {
  COMMON: "common",
  GIRDER: "girder",
  HIP: "hip",
  VALLEY: "valley",
  MONO: "mono",
  DUTCH_GABLE: "dutch_gable"
};

export const TRUSS_SPACINGS = [
  { value: 450, label: "450 mm centres" },
  { value: 600, label: "600 mm centres (Standard)" },
  { value: 900, label: "900 mm centres (Economical)" },
  { value: 1200, label: "1200 mm centres (Commercial)" }
];

export const BRACING_TYPES = [
  { value: "Pryda Speedbrace Galvanised Strap", label: "Pryda Speedbrace Galvanised Strap" },
  { value: "Timber Cross Diagonal Bracing", label: "Timber Cross Diagonal Bracing" },
  { value: "Plywood Gusset Bracing Panel", label: "Plywood Gusset Bracing Panel" },
  { value: "Heavy Duty Tensioner Strap", label: "Heavy Duty Tensioner Strap" }
];

const TrussEngine = {
  /**
   * Tính khoảng cách Euclidean giữa 2 điểm
   */
  dist(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  /**
   * Tính toán hình học chi tiết của 1 vì kèo đơn (Single Truss Profile)
   */
  computeSingleTrussProfile({ spanM, pitchDeg = 22.5, overhangMm = 450, heelHeightMm = 150 }) {
    const halfSpan = spanM / 2;
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const apexHeight = halfSpan * Math.tan(pitchRad) + (heelHeightMm / 1000);
    const topChordLength = Math.sqrt(halfSpan * halfSpan + (apexHeight - heelHeightMm / 1000) ** 2) + (overhangMm / 1000);
    const totalTopChordLm = topChordLength * 2;
    const bottomChordLm = spanM + ((overhangMm * 2) / 1000);

    // Tính toán webbing sơ bộ (Fink / Howe web layout)
    const kingPostHeight = apexHeight;
    const webLengthEstimate = (kingPostHeight * 2.4);
    const totalTimberLm = Number((totalTopChordLm + bottomChordLm + webLengthEstimate).toFixed(2));

    return {
      spanM,
      pitchDeg,
      apexHeightM: Number(apexHeight.toFixed(3)),
      topChordLm: Number(totalTopChordLm.toFixed(2)),
      bottomChordLm: Number(bottomChordLm.toFixed(2)),
      totalTimberLm,
      nailPlateCount: 14 // Ước tính số lượng bản mã răng cưa / đinh liên kết
    };
  },

  /**
   * Sinh hệ giàn kèo song song (Array of parallel trusses) theo đường trục hoặc biên mái
   */
  generateParallelTrussLayout({
    startPoint,
    endPoint,
    spanM,
    spacingMm = 600,
    runLengthM = 12.0,
    pitchDeg = 22.5,
    trussType = TRUSS_TYPES.COMMON,
    label = "T01"
  }) {
    const spacingM = spacingMm / 1000;
    const count = Math.max(2, Math.floor(runLengthM / spacingM) + 1);

    const singleProfile = TrussEngine.computeSingleTrussProfile({ spanM, pitchDeg });
    const subTrusses = [];

    // Tính vector pháp tuyến để rải các kèo song song
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;

    for (let i = 0; i < count; i++) {
      const offsetPx = (i * spacingM) * (length / spanM);
      subTrusses.push({
        index: i + 1,
        code: `${label}.${i + 1}`,
        p1: { x: startPoint.x + nx * offsetPx, y: startPoint.y + ny * offsetPx },
        p2: { x: endPoint.x + nx * offsetPx, y: endPoint.y + ny * offsetPx },
        spanM
      });
    }

    const totalTimberLm = Number((singleProfile.totalTimberLm * count).toFixed(1));
    const speedbraceRolls = Math.max(1, Math.ceil((runLengthM * 2.5) / 50)); // 1 cuộn 50m

    return {
      id: "truss-" + Date.now(),
      label,
      trussType,
      spanM: Number(spanM.toFixed(2)),
      runLengthM: Number(runLengthM.toFixed(2)),
      spacingMm,
      pitchDeg,
      quantity: count,
      singleProfile,
      totalTimberLm,
      speedbraceRolls,
      subTrusses,
      startPoint,
      endPoint
    };
  },

  /**
   * Tự động sinh hệ giàn kèo từ Polygon Mái (Roof Polygon)
   */
  generateTrussesFromRoof(roof, scaleFactor = 50, realScale = 0.02) {
    if (!roof || !roof.polygon || roof.polygon.length < 3) {
      return null;
    }

    const poly = roof.polygon;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    poly.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const scale = (scaleFactor && scaleFactor > 0) ? (1 / scaleFactor) : (realScale || 0.02);
    const widthM = (maxX - minX) * scale;
    const heightM = (maxY - minY) * scale;

    // Chọn nhịp nhỏ hơn làm hướng gác kèo (span) và chiều dài lớn hơn làm run length
    const spanM = Math.min(widthM, heightM) || 8.5;
    const runLengthM = Math.max(widthM, heightM) || 12.0;

    let startPoint, endPoint;
    if (widthM <= heightM) {
      startPoint = { x: minX, y: minY };
      endPoint = { x: maxX, y: minY };
    } else {
      startPoint = { x: minX, y: minY };
      endPoint = { x: minX, y: maxY };
    }

    return TrussEngine.generateParallelTrussLayout({
      startPoint,
      endPoint,
      spanM,
      runLengthM,
      spacingMm: 600,
      pitchDeg: roof.pitch || 22.5,
      trussType: TRUSS_TYPES.COMMON,
      label: "T01 (Auto-Roof)"
    });
  }
};

if (typeof window !== "undefined") {
  window.TrussEngine = TrussEngine;
}

export default TrussEngine;
