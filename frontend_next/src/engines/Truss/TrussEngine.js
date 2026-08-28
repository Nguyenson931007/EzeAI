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

export const TrussEngine = {
  computeSingleTrussProfile(spanM, pitchDeg = 22.5, trussType = TRUSS_TYPES.COMMON) {
    const halfSpan = spanM / 2;
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const apexHeightM = Number((halfSpan * Math.tan(pitchRad)).toFixed(3));
    const topChordLengthM = Number((halfSpan / Math.cos(pitchRad)).toFixed(3));
    const bottomChordLengthM = Number(spanM.toFixed(3));

    let webMemberLengthM = 0;
    let webCount = 4;
    if (spanM <= 6.0) {
      webCount = 2; // King post or Simple Fink
      webMemberLengthM = Number((apexHeightM + Math.hypot(halfSpan / 2, apexHeightM / 2) * 2).toFixed(3));
    } else if (spanM <= 10.0) {
      webCount = 4; // Standard Fink
      webMemberLengthM = Number((Math.hypot(spanM / 3, apexHeightM * 0.6) * 4).toFixed(3));
    } else {
      webCount = 6; // Fan / Howe
      webMemberLengthM = Number((Math.hypot(spanM / 4, apexHeightM * 0.75) * 6).toFixed(3));
    }

    const totalTimberLm = Number((topChordLengthM * 2 + bottomChordLengthM + webMemberLengthM).toFixed(2));
    const nailplateCount = (webCount + 3) * 2;

    return {
      apexHeightM,
      topChordLengthM,
      bottomChordLengthM,
      webMemberLengthM,
      webCount,
      totalTimberLm,
      nailplateCount
    };
  },

  generateParallelTrussLayout({
    startPoint,
    endPoint,
    spanM,
    runLengthM,
    spacingMm = 600,
    pitchDeg = 22.5,
    trussType = TRUSS_TYPES.COMMON,
    label = "T01"
  }) {
    const spacingM = spacingMm / 1000;
    const count = Math.max(2, Math.floor(runLengthM / spacingM) + 1);
    const singleProfile = this.computeSingleTrussProfile(spanM, pitchDeg, trussType);

    const subTrusses = [];
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;

    let nx = -dy / length;
    let ny = dx / length;
    if (nx < 0 || (nx === 0 && ny < 0)) {
      nx = -nx;
      ny = -ny;
    }

    const scalePxPerM = length / spanM;

    for (let i = 0; i < count; i++) {
      const offsetPx = (i * spacingM) * scalePxPerM;
      subTrusses.push({
        index: i + 1,
        code: `${label}.${i + 1}`,
        p1: { x: startPoint.x + nx * offsetPx, y: startPoint.y + ny * offsetPx },
        p2: { x: endPoint.x + nx * offsetPx, y: endPoint.y + ny * offsetPx },
        spanM
      });
    }

    const totalTimberLm = Number((singleProfile.totalTimberLm * count).toFixed(1));
    const speedbraceRolls = Math.max(1, Math.ceil((runLengthM * 2.5) / 50));

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

    const spanM = Math.max(3, Math.min(widthM, heightM) || 8.5);
    const runLengthM = Math.max(4, Math.max(widthM, heightM) || 12.0);

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
