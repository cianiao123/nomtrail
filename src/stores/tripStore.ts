import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Trip, Day, Activity, ValidationWarning } from '@/types/trip';
import { reindex } from '@/lib/utils/orderUtils';
import { createId } from '@/lib/utils/createId';

interface TripState {
  // All trips (persisted)
  trips: Record<string, Trip>;
  tripIds: string[];

  // Current trip being edited/viewed
  currentTrip: Trip | null;
  isLoadingTrip: boolean;
  tripError: string | null;

  // Generation state
  generationStatus: 'idle' | 'generating' | 'complete' | 'error';
  generationStep: number;
  generationWarnings: ValidationWarning[];

  // Trip CRUD
  saveTrip: (trip: Trip) => void;
  loadTrip: (id: string) => Trip | null;
  removeTrip: (id: string) => void;
  getAllTrips: () => Trip[];

  // Current Trip Actions
  setCurrentTrip: (trip: Trip) => void;
  clearCurrentTrip: () => void;
  updateTripMeta: (updates: Partial<Trip>) => void;

  // Day Actions
  addDay: () => void;
  removeDay: (dayId: string) => void;

  // Activity Actions
  addActivity: (dayId: string, activity: Activity) => void;
  updateActivity: (activityId: string, updates: Partial<Activity>) => void;
  removeActivity: (activityId: string) => void;
  reorderActivities: (dayId: string, activeId: string, overId: string) => void;

  // Generation Actions
  setGenerationStatus: (status: TripState['generationStatus']) => void;
  setGenerationStep: (step: number) => void;
  addGenerationWarning: (warning: ValidationWarning) => void;
  applyGeneratedDays: (days: Day[]) => void;
}

function syncTrips(set: any, get: any, updatedTrip: Trip) {
  set({
    currentTrip: updatedTrip,
    trips: { ...get().trips, [updatedTrip.id]: updatedTrip },
    tripIds: get().tripIds.includes(updatedTrip.id)
      ? get().tripIds
      : [updatedTrip.id, ...get().tripIds],
  });
}

export const useTripStore = create<TripState>()(
  persist(
    (set, get) => ({
      trips: {},
      tripIds: [],
      currentTrip: null,
      isLoadingTrip: false,
      tripError: null,
      generationStatus: 'idle',
      generationStep: 0,
      generationWarnings: [],

      saveTrip: (trip) => syncTrips(set, get, trip),
      loadTrip: (id) => get().trips[id] || null,
      removeTrip: (id) => {
        const { [id]: _, ...rest } = get().trips;
        set({ trips: rest, tripIds: get().tripIds.filter((tid) => tid !== id) });
        if (get().currentTrip?.id === id) set({ currentTrip: null });
      },
      getAllTrips: () => get().tripIds.map((id) => get().trips[id]!).filter(Boolean),

      setCurrentTrip: (trip) => set({ currentTrip: trip }),
      clearCurrentTrip: () => set({ currentTrip: null }),
      updateTripMeta: (updates) => {
        const trip = get().currentTrip;
        if (!trip) return;
        const updated = { ...trip, ...updates, updatedAt: new Date().toISOString() };
        syncTrips(set, get, updated);
      },

      addDay: () => {
        const trip = get().currentTrip;
        if (!trip) return;
        const newDay: Day = {
          id: createId('day'),
          tripId: trip.id,
          dayIndex: trip.days.length,
          date: trip.days.length > 0
            ? new Date(new Date(trip.startDate).getTime() + (trip.days.length - 1) * 86400000).toISOString().split('T')[0]!
            : trip.startDate,
          activities: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const updated = { ...trip, days: [...trip.days, newDay] };
        syncTrips(set, get, updated);
      },

      removeDay: (dayId) => {
        const trip = get().currentTrip;
        if (!trip) return;
        const updated = {
          ...trip,
          days: trip.days.filter((d) => d.id !== dayId).map((d, i) => ({ ...d, dayIndex: i })),
        };
        syncTrips(set, get, updated);
      },

      addActivity: (dayId, activity) => {
        const trip = get().currentTrip;
        if (!trip) return;
        const updated = {
          ...trip,
          days: trip.days.map((d) => {
            if (d.id !== dayId) return d;
            const maxOrder = d.activities.length > 0 ? Math.max(...d.activities.map((a) => a.order)) : 0;
            return { ...d, activities: [...d.activities, { ...activity, order: maxOrder + 1000 }] };
          }),
        };
        syncTrips(set, get, updated);
      },

      updateActivity: (activityId, updates) => {
        const trip = get().currentTrip;
        if (!trip) return;
        const updated = {
          ...trip,
          days: trip.days.map((d) => ({
            ...d,
            activities: d.activities.map((a) =>
              a.id === activityId ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
            ),
          })),
        };
        syncTrips(set, get, updated);
      },

      removeActivity: (activityId) => {
        const trip = get().currentTrip;
        if (!trip) return;
        const updated = {
          ...trip,
          days: trip.days.map((d) => ({
            ...d,
            activities: d.activities.filter((a) => a.id !== activityId).map((a, i) => ({ ...a, order: (i + 1) * 1000 })),
          })),
        };
        syncTrips(set, get, updated);
      },

      reorderActivities: (dayId, activeId, overId) => {
        const trip = get().currentTrip;
        if (!trip) return;
        const day = trip.days.find((d) => d.id === dayId);
        if (!day) return;

        const activities = [...day.activities];
        const activeIndex = activities.findIndex((a) => a.id === activeId);
        const overIndex = activities.findIndex((a) => a.id === overId);
        if (activeIndex === -1 || overIndex === -1) return;

        const [moved] = activities.splice(activeIndex, 1);
        activities.splice(overIndex, 0, moved);
        const newOrders = reindex(activities.map((a) => a.order));

        const updated = {
          ...trip,
          days: trip.days.map((d) =>
            d.id === dayId
              ? { ...d, activities: activities.map((a, i) => ({ ...a, order: newOrders[i]! })) }
              : d
          ),
        };
        syncTrips(set, get, updated);
      },

      setGenerationStatus: (status) => set({ generationStatus: status }),
      setGenerationStep: (step) => set({ generationStep: step }),
      addGenerationWarning: (warning) =>
        set((s) => ({ generationWarnings: [...s.generationWarnings, warning] })),
      applyGeneratedDays: (days) => {
        const trip = get().currentTrip;
        if (!trip) return;
        const updated = { ...trip, days, status: 'generated' as const };
        syncTrips(set, get, updated);
      },
    }),
    {
      name: 'lumina-trips-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        trips: state.trips,
        tripIds: state.tripIds,
      }),
    }
  )
);
