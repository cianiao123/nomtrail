import { create } from 'zustand';

interface MapState {
  center: [number, number]; // [lng, lat]
  zoom: number;
  activePOIId: string | null;
  selectedDayIndex: number;
  visibleMarkers: boolean;
  visibleRoutes: boolean;

  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setActivePOI: (poiId: string | null) => void;
  setSelectedDay: (dayIndex: number) => void;
  toggleMarkers: () => void;
  toggleRoutes: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [116.397428, 39.90923],
  zoom: 12,
  activePOIId: null,
  selectedDayIndex: 0,
  visibleMarkers: true,
  visibleRoutes: true,

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setActivePOI: (poiId) => set({ activePOIId: poiId }),
  setSelectedDay: (dayIndex) => set({ selectedDayIndex: dayIndex }),
  toggleMarkers: () => set((s) => ({ visibleMarkers: !s.visibleMarkers })),
  toggleRoutes: () => set((s) => ({ visibleRoutes: !s.visibleRoutes })),
}));
