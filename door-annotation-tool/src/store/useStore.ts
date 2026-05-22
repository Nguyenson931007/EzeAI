import { create } from 'zustand';
import { produce } from 'immer';
import type { Point } from '../geometry/vectors';
import type { DoorSemantics } from '../geometry/semantics';
import type { DoorType } from '../types/door';

/**
 * ToolType — Expanded to include specific door sub-tools for each of the
 * 5 architectural door types, plus the original generic tools.
 */
export type ToolType =
  | 'select'
  | 'door'            // Legacy generic door tool (single door)
  | 'door_single'
  | 'door_double'
  | 'door_sliding'
  | 'door_cavity'
  | 'door_bifold'
  | 'wall'
  | 'window'
  | 'pan'
  | 'measure';

/** Returns true if the tool is any door drawing sub-tool. */
export const isDoorTool = (tool: ToolType): boolean =>
  tool === 'door' ||
  tool === 'door_single' ||
  tool === 'door_double' ||
  tool === 'door_sliding' ||
  tool === 'door_cavity' ||
  tool === 'door_bifold';

/** Maps a door tool to its DoorType enum value. */
export const doorToolToDoorType = (tool: ToolType): DoorType => {
  switch (tool) {
    case 'door_double':  return 'double_door';
    case 'door_sliding': return 'sliding_door';
    case 'door_cavity':  return 'cavity_slider';
    case 'door_bifold':  return 'bi_fold';
    case 'door':
    case 'door_single':
    default:             return 'single_door';
  }
};

export interface ClassDefinition {
  id: number;
  name: string;
  color: string;
}

export interface Annotation {
  id: string;
  type: ToolType;
  classId: number;
  points: Point[];
  semantics?: DoorSemantics;
  polygon: Point[];
  arcPoints: Point[];
  metadata: Record<string, any>;
  isVisible: boolean;
  isLocked: boolean;
  geometry?: {
    polygon: Point[];
    width: number;
  };
}

export type { Point };

interface EditorState {
  // Canvas State
  image: HTMLImageElement | null;
  imageSize: { width: number; height: number };
  imageName: string;
  scale: number;
  zoom: number; // Compatibility alias
  position: { x: number; y: number };
  
  // App State
  activeTool: ToolType;
  tool: ToolType; // Compatibility alias
  selectedIds: string[];
  annotations: Annotation[];
  
  // Door Drawing State — tracks multi-click in-progress drawing
  doorClickPoints: Point[];
  activeDoorType: DoorType;

  // Settings
  gridEnabled: boolean;
  snapEnabled: boolean;
  showGrid: boolean; // Compatibility alias
  showSnap: boolean; // Compatibility alias
  debugEnabled: boolean;

  // PDF Multi-page state
  pdfPages: { image: HTMLImageElement; width: number; height: number; pageNumber: number }[];
  currentPageIndex: number;

  // Actions
  setImage: (image: HTMLImageElement | null, name?: string) => void;
  setTool: (tool: ToolType) => void;
  setSelectedIds: (ids: string[]) => void;
  setTransform: (scale: number, x: number, y: number) => void;
  
  // Annotation Actions (Direct & Compatibility)
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  toggleLayer: (id: string) => void;
  
  // Door Drawing Actions
  setDoorClickPoints: (points: Point[]) => void;
  resetDoorDrawing: () => void;

  // Grid/Snap Actions
  toggleGrid: () => void;
  toggleSnap: () => void;

  // PDF Page Actions
  setPdfPages: (pages: { image: HTMLImageElement; width: number; height: number; pageNumber: number }[]) => void;
  setCurrentPageIndex: (index: number) => void;
  
  // Global Reset
  clearWorkspace: () => void;
}

export const useStore = create<EditorState>((set) => ({
  image: null,
  imageSize: { width: 0, height: 0 },
  imageName: 'floorplan.png',
  scale: 1,
  zoom: 1,
  position: { x: 0, y: 0 },
  
  activeTool: 'select',
  tool: 'select',
  selectedIds: [],
  annotations: [],
  
  // Door drawing defaults
  doorClickPoints: [],
  activeDoorType: 'single_door',

  gridEnabled: true,
  snapEnabled: true,
  showGrid: true,
  showSnap: true,
  debugEnabled: false,

  pdfPages: [],
  currentPageIndex: 0,

  setImage: (image, name) => set({ 
    image, 
    imageSize: image ? { width: image.width, height: image.height } : { width: 0, height: 0 },
    imageName: name || 'floorplan.png'
  }),

  setTool: (tool) => set({
    activeTool: tool,
    tool,
    // When switching tools, resolve the door type and reset click state
    activeDoorType: isDoorTool(tool) ? doorToolToDoorType(tool) : 'single_door',
    doorClickPoints: [],
  }),
  
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  
  setTransform: (scale, x, y) => set({ scale, zoom: scale, position: { x, y } }),

  setAnnotations: (annotations) => set({ annotations }),
  
  addAnnotation: (ann) => set((state) => ({ 
    annotations: [...state.annotations, ann] 
  })),

  updateAnnotation: (id, updates) => set(produce((state: EditorState) => {
    const ann = state.annotations.find(a => a.id === id);
    if (ann) {
      Object.assign(ann, updates);
      if (updates.semantics && ann.semantics) {
        ann.semantics = { ...ann.semantics, ...updates.semantics };
      }
    }
  })),

  toggleLayer: (id) => set(produce((state: EditorState) => {
    const ann = state.annotations.find(a => a.id === id);
    if (ann) ann.isVisible = !ann.isVisible;
  })),

  // Door drawing state
  setDoorClickPoints: (points) => set({ doorClickPoints: points }),
  resetDoorDrawing: () => set({ doorClickPoints: [] }),

  toggleGrid: () => set((state) => ({ 
    gridEnabled: !state.gridEnabled, 
    showGrid: !state.showGrid 
  })),

  toggleSnap: () => set((state) => ({ 
    snapEnabled: !state.snapEnabled, 
    showSnap: !state.showSnap 
  })),

  setPdfPages: (pdfPages) => set({ 
    pdfPages, 
    currentPageIndex: 0,
    annotations: [], // Reset annotations for new document
    selectedIds: [],
  }),

  setCurrentPageIndex: (currentPageIndex) => set((state) => {
    const page = state.pdfPages[currentPageIndex];
    if (page) {
      return {
        currentPageIndex,
        image: page.image,
        imageSize: { width: page.width, height: page.height },
        selectedIds: [], // Reset selection on page switch
      };
    }
    return { currentPageIndex };
  }),

  clearWorkspace: () => set({
    image: null,
    imageSize: { width: 0, height: 0 },
    imageName: 'floorplan.png',
    scale: 1,
    zoom: 1,
    position: { x: 0, y: 0 },
    pdfPages: [],
    currentPageIndex: 0,
    annotations: [],
    selectedIds: [],
    doorClickPoints: [],
  }),
}));
