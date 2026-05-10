// === Core Domain Types ===

export type ActivityType = 'attraction' | 'food' | 'hotel' | 'transport' | 'other';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface POIInfo {
  amapId: string;
  name: string;
  address: string;
  coordinate: Coordinate;
  category: string;
  photos: string[];
  rating?: number;
  priceRange?: string;
  openingHours?: string;
  phone?: string;
}

export interface Activity {
  id: string;
  dayId: string;
  order: number;
  type: ActivityType;
  poi: POIInfo | null;
  customName?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  notes?: string;
  estimatedCost?: number;
  sourceReason?: string;
  openingHours?: string;
  recommendedDuration?: number;
  travelMinutesFromPrev?: number;
  bookingRequired?: boolean;
  weatherFit?: 'any' | 'sunny' | 'rainy' | 'indoor' | 'night';
  ticketReference?: string;
  isGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DayRoute {
  polylinePoints: Coordinate[];
  totalDistanceKm: number;
  estimatedTravelMinutes: number;
}

export interface DayWeather {
  date: string;
  condition: string;
  tempHigh: number;
  tempLow: number;
  humidity: number;
  windSpeed: number;
  icon: string;
}

export interface Day {
  id: string;
  tripId: string;
  dayIndex: number;
  date: string;
  activities: Activity[];
  route?: DayRoute;
  notes?: string;
  weather?: DayWeather;
  createdAt: string;
  updatedAt: string;
}

export type PreferenceTag =
  | '自然风光' | '历史文化' | '美食探索' | '购物娱乐'
  | '亲子出游' | '蜜月浪漫' | '户外冒险' | '休闲度假'
  | '摄影打卡' | '深度小众' | '城市漫步' | '自驾旅行';

export interface Trip {
  id: string;
  userId: string;
  title: string;
  destination: string;
  destinationCoord: Coordinate;
  startDate: string;
  endDate: string;
  travelers: { adults: number; children: number };
  budget: { currency: string; min: number; max: number };
  preferences: PreferenceTag[];
  days: Day[];
  status: 'draft' | 'generated' | 'edited' | 'finalized';
  aiConversationId?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  defaultBudget: { min: number; max: number };
  travelStyle: PreferenceTag[];
  dietaryRestrictions: string[];
  preferredPace: 'relaxed' | 'moderate' | 'intensive';
  accommodationType: 'budget' | 'comfort' | 'luxury';
  transportationPreference: 'public' | 'car' | 'mixed';
}

export interface ValidationWarning {
  severity: 'warning' | 'error';
  dayIndex: number;
  activityIndex: number;
  message: string;
  suggestion: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  tier: 'free' | 'premium';
  preferences: UserPreferences;
  savedDestinations: string[];
  createdAt: string;
}
