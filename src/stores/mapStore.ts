import { create } from 'zustand';
import type { SavedPlaceCandidate } from '@/types/agent';

interface MapState {
  center: [number, number]; // [lng, lat]
  zoom: number;
  activePOIId: string | null;
  selectedDayIndex: number;
  visibleMarkers: boolean;
  visibleRoutes: boolean;
  candidatePreviewPlaces: SavedPlaceCandidate[];

  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setActivePOI: (poiId: string | null) => void;
  setSelectedDay: (dayIndex: number) => void;
  toggleMarkers: () => void;
  toggleRoutes: () => void;
  setCandidatePreviewPlaces: (places: SavedPlaceCandidate[]) => void;
  clearCandidatePreviewPlaces: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [116.397428, 39.90923],
  zoom: 12,
  activePOIId: null,
  selectedDayIndex: 0,
  visibleMarkers: true,
  visibleRoutes: true,
  candidatePreviewPlaces: [],

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setActivePOI: (poiId) => set({ activePOIId: poiId }),
  setSelectedDay: (dayIndex) => set({ selectedDayIndex: dayIndex }),
  toggleMarkers: () => set((s) => ({ visibleMarkers: !s.visibleMarkers })),
  toggleRoutes: () => set((s) => ({ visibleRoutes: !s.visibleRoutes })),
  setCandidatePreviewPlaces: (places) => set({ candidatePreviewPlaces: places }),
  clearCandidatePreviewPlaces: () => set({ candidatePreviewPlaces: [] }),
}));
