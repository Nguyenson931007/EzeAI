import React from "react";

/**
 * Shared plan label for both AI-generated and manually-added openings.
 * Keeps typography/spacing identical. AI provenance is shown only as a
 * compact badge beside the opening name.
 */
export default function OpeningPlanLabel({
  x,
  y,
  angleDeg = 0,
  name = "",
  dimension = "",
  isAI = false,
  isSelected = false,
  selectedColor = "#FF5722",
}) {
  const cleanName = String(name || "").trim();
  const cleanDimension = String(dimension || "").trim();
  if (!cleanName && !cleanDimension) return null;

  const nameFontSize = 16;
  const dimensionFontSize = 18;

  // Centre the complete "D-020 + AI" row as one unit. The name used to stay
  // centred while the badge was appended on the right, making AI doors look
  // visually heavier than otherwise-identical manual doors.
  const nameWidth = Math.max(1, cleanName.length * 8.4);
  const badgeW = 22;
  const badgeH = 16;
  const badgeGap = 6;
  const labelRowWidth = isAI && cleanName ? nameWidth + badgeGap + badgeW : nameWidth;
  const nameCenterX = isAI && cleanName ? (-labelRowWidth / 2) + (nameWidth / 2) : 0;
  const badgeCenterX = (-labelRowWidth / 2) + nameWidth + badgeGap + (badgeW / 2);
  const badgeCenterY = -33;

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${angleDeg})`}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {cleanName && (
        <text
          x={nameCenterX}
          y={-28}
          fontSize={nameFontSize}
          textAnchor="middle"
          fill={isSelected ? selectedColor : "#64748b"}
          fontFamily="Inter, sans-serif"
          fontWeight="700"
          style={{
            textShadow: isSelected
              ? "none"
              : "0 0 3px white, 0 0 3px white",
          }}
        >
          {cleanName}
        </text>
      )}

      {cleanDimension && (
        <text
          x={0}
          y={-13}
          fontSize={dimensionFontSize}
          textAnchor="middle"
          fill={isSelected ? selectedColor : "#1e293b"}
          fontFamily="Inter, sans-serif"
          fontWeight="700"
          style={{
            textShadow: isSelected
              ? "none"
              : "0 0 3px white, 0 0 3px white",
          }}
        >
          {cleanDimension}
        </text>
      )}

      {isAI && cleanName && (
        <g transform={`translate(${badgeCenterX}, ${badgeCenterY})`}>
          <rect
            x={-badgeW / 2}
            y={-badgeH / 2}
            width={badgeW}
            height={badgeH}
            rx={badgeH / 2}
            fill="#4F46E5"
            stroke="#C7D2FE"
            strokeWidth={1.4}
            style={{ filter: "drop-shadow(0 1px 2px rgba(79,70,229,0.35))" }}
          />
          <text
            x={0}
            y={0.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#FFFFFF"
            fontFamily="Inter, sans-serif"
            fontSize="8"
            fontWeight="900"
            letterSpacing="0.2"
          >
            AI
          </text>
        </g>
      )}
    </g>
  );
}
