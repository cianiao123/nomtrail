import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserProfile, UserPreferences, PreferenceTag } from '@/types/trip';

interface UserState {
  userProfile: UserProfile | null;
  userPreferences: UserPreferences;
  recentTripIds: string[];
  isAuthenticated: boolean;

  setUser: (profile: UserProfile) => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
  addRecentTrip: (tripId: string) => void;
  setAuthenticated: (auth: boolean) => void;
  logout: () => void;
}

const defaultPreferences: UserPreferences = {
  defaultBudget: { min: 3000, max: 8000 },
  travelStyle: [],
  dietaryRestrictions: [],
  preferredPace: 'moderate',
  accommodationType: 'comfort',
  transportationPreference: 'mixed',
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userProfile: null,
      userPreferences: defaultPreferences,
      recentTripIds: [],
      isAuthenticated: false,

      setUser: (profile) => set({ userProfile: profile, isAuthenticated: true }),
      updatePreferences: (prefs) =>
        set((s) => ({ userPreferences: { ...s.userPreferences, ...prefs } })),
      addRecentTrip: (tripId) =>
        set((s) => ({
          recentTripIds: [
            tripId,
            ...s.recentTripIds.filter((id) => id !== tripId),
          ].slice(0, 20),
        })),
      setAuthenticated: (auth) => set({ isAuthenticated: auth }),
      logout: () => set({ userProfile: null, isAuthenticated: false }),
    }),
    {
      name: 'lumina-travel-user',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userProfile: state.userProfile,
        isAuthenticated: state.isAuthenticated,
        userPreferences: state.userPreferences,
        recentTripIds: state.recentTripIds,
      }),
    }
  )
);
