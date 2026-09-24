// Cursor utilities for Canvas & Markup tools

/**
 * Returns a custom SVG brush cursor data URI with the tip at bottom-left (2, 29).
 * Hotspot is (2, 29) matching the precise drawing point.
 * @param {string} color - Selected brush color (hex or CSS color)
 * @returns {string} CSS cursor value
 */
export const getBrushCursor = (color = "#facc15") => {
  const safeColor = (color && color.startsWith("#")) ? color : "#facc15";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <g>
      <!-- Contrast outline / drop shadow -->
      <path d="M2 29 C2 29 4 24 10 18 L18 10 C21 7 24 4 27 4 C28.5 5.5 28.5 8 26 10.5 L18 18 C12 24 7 29 2 29 Z" fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity="0.7"/>
      <path d="M2 29 C2 29 4 24 10 18 L18 10 C21 7 24 4 27 4 C28.5 5.5 28.5 8 26 10.5 L18 18 C12 24 7 29 2 29 Z" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      <!-- Wooden / Slate Handle -->
      <path d="M15 13 L19 9 C22 6 24.5 4.5 26.5 4.5 C27.5 5.5 27.5 7 25.5 9 C23.5 11 19 15 19 15 Z" fill="#475569" stroke="#1e293b" stroke-width="0.8"/>
      <path d="M19 10 L25.5 5.5" stroke="#94a3b8" stroke-width="0.8" stroke-linecap="round"/>
      <!-- Ferrule (Silver metal band) -->
      <polygon points="12,16 15,13 19,15 15,19" fill="#cbd5e1" stroke="#334155" stroke-width="0.8"/>
      <line x1="13.5" y1="17.5" x2="16.5" y2="14.5" stroke="#94a3b8" stroke-width="0.6"/>
      <!-- Bristles -->
      <path d="M2 29 C2 29 4.5 24 12 16 L15 19 C10 25 2 29 2 29 Z" fill="#334155" stroke="#1e293b" stroke-width="0.8"/>
      <!-- Wet paint tip with highlight color -->
      <path d="M2 29 C2 29 3.8 25.5 7.5 22 L10 24.5 C6.5 27.5 2 29 2 29 Z" fill="${safeColor}" stroke="#1e293b" stroke-width="0.6"/>
      <!-- Tip point dot for precision -->
      <circle cx="2" cy="29" r="0.6" fill="#ffffff" stroke="#000000" stroke-width="0.4"/>
    </g>
  </svg>`;

  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 2 29, crosshair`;
};
