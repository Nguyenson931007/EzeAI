import { create } from 'zustand';

const DEFAULT_CONFIDENCE = {
  rooms: 0.3,
  doors: 0.2,
  windows: 0.01,
  walls: 0.01,
  ocr: 0.7,
  symbols: 0.60
};

const loadPersistedConfig = () => {
  if (typeof window === 'undefined') return DEFAULT_CONFIDENCE;
  try {
    const saved = localStorage.getItem('ezefloor_ai_confidence');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate structure
      return {
        rooms: typeof parsed.rooms === 'number' ? parsed.rooms : DEFAULT_CONFIDENCE.rooms,
        doors: typeof parsed.doors === 'number' ? parsed.doors : DEFAULT_CONFIDENCE.doors,
        windows: typeof parsed.windows === 'number' ? parsed.windows : DEFAULT_CONFIDENCE.windows,
        walls: typeof parsed.walls === 'number' ? parsed.walls : DEFAULT_CONFIDENCE.walls,
        ocr: typeof parsed.ocr === 'number' ? parsed.ocr : DEFAULT_CONFIDENCE.ocr,
        symbols: typeof parsed.symbols === 'number' ? parsed.symbols : DEFAULT_CONFIDENCE.symbols
      };
    }
  } catch (e) {
    console.error('Failed to load persisted confidence config:', e);
  }
  return DEFAULT_CONFIDENCE;
};

export const useAIConfigStore = create((set, get) => ({
  config: loadPersistedConfig(),
  heatmapMode: typeof window !== 'undefined' && localStorage.getItem('ezefloor_ai_heatmap') === 'true',

  toggleHeatmap: () => {
    const nextVal = !get().heatmapMode;
    set({ heatmapMode: nextVal });
    localStorage.setItem('ezefloor_ai_heatmap', String(nextVal));
  },

  // Actions for individual confidence values
  setRoomConfidence: (val) => {
    const updated = { ...get().config, rooms: Math.max(0, Math.min(1, parseFloat(val) || 0)) };
    set({ config: updated });
    localStorage.setItem('ezefloor_ai_confidence', JSON.stringify(updated));
  },

  setDoorConfidence: (val) => {
    const updated = { ...get().config, doors: Math.max(0, Math.min(1, parseFloat(val) || 0)) };
    set({ config: updated });
    localStorage.setItem('ezefloor_ai_confidence', JSON.stringify(updated));
  },

  setWindowConfidence: (val) => {
    const updated = { ...get().config, windows: Math.max(0, Math.min(1, parseFloat(val) || 0)) };
    set({ config: updated });
    localStorage.setItem('ezefloor_ai_confidence', JSON.stringify(updated));
  },

  setWallConfidence: (val) => {
    const updated = { ...get().config, walls: Math.max(0, Math.min(1, parseFloat(val) || 0)) };
    set({ config: updated });
    localStorage.setItem('ezefloor_ai_confidence', JSON.stringify(updated));
  },

  setOCRConfidence: (val) => {
    const updated = { ...get().config, ocr: Math.max(0, Math.min(1, parseFloat(val) || 0)) };
    set({ config: updated });
    localStorage.setItem('ezefloor_ai_confidence', JSON.stringify(updated));
  },

  setSymbolConfidence: (val) => {
    const updated = { ...get().config, symbols: Math.max(0, Math.min(1, parseFloat(val) || 0)) };
    set({ config: updated });
    localStorage.setItem('ezefloor_ai_confidence', JSON.stringify(updated));
  },

  // Apply a full config object at once (e.g. from presets)
  applyConfig: (newConfig) => {
    const updated = { ...DEFAULT_CONFIDENCE, ...newConfig };
    set({ config: updated });
    localStorage.setItem('ezefloor_ai_confidence', JSON.stringify(updated));
  },

  // Reset to CAD defaults
  resetDefaults: () => {
    set({ config: { ...DEFAULT_CONFIDENCE } });
    localStorage.setItem('ezefloor_ai_confidence', JSON.stringify(DEFAULT_CONFIDENCE));
  },

  // Export utility
  exportConfig: () => {
    return JSON.stringify(get().config, null, 2);
  },

  // Import utility
  importConfig: (jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      const updated = {
        rooms: typeof parsed.rooms === 'number' ? parsed.rooms : get().config.rooms,
        doors: typeof parsed.doors === 'number' ? parsed.doors : get().config.doors,
        windows: typeof parsed.windows === 'number' ? parsed.windows : get().config.windows,
        walls: typeof parsed.walls === 'number' ? parsed.walls : get().config.walls,
        ocr: typeof parsed.ocr === 'number' ? parsed.ocr : get().config.ocr,
        symbols: typeof parsed.symbols === 'number' ? parsed.symbols : get().config.symbols
      };
      set({ config: updated });
      localStorage.setItem('ezefloor_ai_confidence', JSON.stringify(updated));
      return true;
    } catch (e) {
      console.error('Failed to import JSON config:', e);
      return false;
    }
  }
}));
