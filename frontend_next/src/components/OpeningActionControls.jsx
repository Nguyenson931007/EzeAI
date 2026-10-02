import React from "react";

/** Shared on-plan controls for manual and AI doors. */
export default function OpeningActionControls({
  x,
  y,
  angleDeg = 0,
  offset = 58,
  onFlipHinge,
  onFlipSwing,
  onEdit,
}) {
  const [hoveredAction, setHoveredAction] = React.useState(null);
  const actions = [
    onFlipHinge ? { key: "hinge", label: "⇄", title: "Flip hinge direction", run: onFlipHinge } : null,
    onFlipSwing ? { key: "swing", label: "↕", title: "Flip swing direction", run: onFlipSwing } : null,
    onEdit ? { key: "edit", label: "✎", title: "Edit door details", run: onEdit } : null,
  ].filter(Boolean);

  if (!actions.length) return null;

  const buttonWidth = 30;
  const buttonHeight = 26;
  const padding = 3;
  const groupWidth = actions.length * buttonWidth + padding * 2;

  const runAction = (event, action) => {
    event.preventDefault();
    event.stopPropagation();
    action.run();
  };

  return (
    <g
      transform={`translate(${x} ${y}) rotate(${angleDeg}) translate(0 ${offset})`}
      style={{ pointerEvents: "all" }}
    >
      <rect
        x={-groupWidth / 2}
        y={-(buttonHeight + padding * 2) / 2}
        width={groupWidth}
        height={buttonHeight + padding * 2}
        rx={16}
        fill="#111827"
        stroke="#475569"
        strokeWidth={1}
        style={{ filter: "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.45))" }}
      />

      {actions.map((action, index) => {
        const left = -groupWidth / 2 + padding + index * buttonWidth;
        const isHovered = hoveredAction === action.key;

        return (
          <g
            key={action.key}
            role="button"
            tabIndex={0}
            aria-label={action.title}
            onPointerDown={(event) => runAction(event, action)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.detail === 0) action.run();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") runAction(event, action);
            }}
            onPointerEnter={() => setHoveredAction(action.key)}
            onPointerLeave={() => setHoveredAction(null)}
            style={{ cursor: "pointer", outline: "none" }}
          >
            <rect
              x={left + 1}
              y={-buttonHeight / 2}
              width={buttonWidth - 2}
              height={buttonHeight}
              rx={12}
              fill={isHovered ? "#0ea5e9" : "#111827"}
              stroke={isHovered ? "#7dd3fc" : "#64748b"}
              strokeWidth={isHovered ? 1.8 : 1.2}
              style={isHovered
                ? { filter: "drop-shadow(0 0 4px rgba(14, 165, 233, 0.8))" }
                : undefined}
            />
            <text
              x={left + buttonWidth / 2}
              y={1}
              fill="#ffffff"
              fontSize={16}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {action.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
