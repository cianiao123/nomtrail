// === Agent Domain Types ===

import { Coordinate } from './trip';

// === Intent Classification ===

export type IntentType =
  | 'parseTrip'
  | 'parsePlaces'
  | 'recommendDestinations'
  | 'generateItinerary'
  | 'critiqueItinerary'
  | 'reviseItinerary'
  | 'exportItinerary'
  | 'generalChat';

// === Place Cards (distinct from Activity POIs) ===

export interface ParsedPlace {
  id: string;
  name: string;
  address?: string;
  category: 'attraction' | 'food' | 'hotel' | 'transport' | 'other';
  notes?: string;
  estimatedDuration?: number; // minutes
  estimatedCost?: number;
  coordinate?: Coordinate;
  priority: 'must_go' | 'want_to_go' | 'optional';
  sourceText: string; // original text fragment this was parsed from
}

export interface ConfirmedPlace extends ParsedPlace {
  status: 'confirmed' | 'modified' | 'removed';
  modifications?: string;
  confirmedAt: string;
}

export interface InspirationItem {
  title: string;
  summary: string;
  sourceType: 'xhs' | 'web' | 'poi';
  sourceUrl: string;
  author?: string;
  city: string;
  mentionedPlaces: string[];
  tags: string[];
  qualityScore: number;
}

export interface SavedPlaceCandidate {
  name: string;
  city: string;
  category: 'attraction' | 'food' | 'hotel' | 'transport' | 'other';
  priorityTag: 'must_go' | 'nearby_optional' | 'rainy_backup' | 'night_option' | 'food_candidate';
  reason: string;
  sourceRefs: string[];
  coordinate?: Coordinate;
  address?: string;
  openingHours?: string;
  ticketReference?: string;
  recommendedDuration?: number;
  qualityScore: number;
}

// === Transport Planning ===

export interface TransportRequest {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  budget?: number;
}

export interface TransportOption {
  id: string;
  mode: 'train' | 'flight' | 'car' | 'bus';
  fromName: string;
  toName: string;
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  price: number;
  provider: 'mock' | 'amap' | 'baidu' | 'tencent' | 'jisu' | 'juhe' | 'oag' | 'hbgj';
  confidence: 'estimated' | 'realtime' | 'official';
  notes?: string;
}

export interface TransportPlan {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  budget?: number;
  outboundOptions: TransportOption[];
  returnOptions: TransportOption[];
  selectedOutboundId?: string;
  selectedReturnId?: string;
  disclaimer: string;
  fallbackPrompt: string;
}

// === Itinerary Version ===

export interface ActivitySnapshot {
  order: number;
  type: string;
  name: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  estimatedCost?: number;
  poiId?: string;
  notes?: string;
}

export interface DaySnapshot {
  dayIndex: number;
  date: string;
  activities: ActivitySnapshot[];
}

export interface ItineraryVersion {
  id: string;
  versionId: string;
  tripId: string;
  versionNumber: number;
  days: DaySnapshot[];
  changeDescription: string;
  parentVersionId?: string;
  isCurrent: boolean;
  createdAt: string;
  critiqueResult?: CritiqueResult;
}

// === Critique ===

export interface CritiqueIssue {
  severity: 'error' | 'warning' | 'info';
  dayIndex: number;
  activityIndex?: number;
  category: 'overpacked' | 'geo' | 'geography' | 'timing' | 'weather' | 'budget' | 'booking' | 'child_unfriendly' | 'other' | 'rest' | 'logistics' | 'feasibility';
  message: string;
  suggestion: string;
}

export interface CritiqueResult {
  overallScore: number; // 1-10
  paceScore?: number;
  geoScore?: number;
  feasibilityScore?: number;
  issues: CritiqueIssue[];
  summary: string;
  analyzedAt?: string;
}

// === Agent Action Log ===

export interface AgentActionLogEntry {
  id: string;
  timestamp: string;
  nodeName: string;
  intent?: IntentType;
  input: string;
  output: string;
  durationMs?: number;
  error?: string;
}

// === API Types ===

export interface AgentRunRequest {
  threadId: string;
  message: string;
  tripId?: string;
  userId?: string;
}

export interface AgentRunSSEEvent {
  type: 'step' | 'chunk' | 'awaiting_confirmation' | 'complete' | 'error';
  node?: string;
  message?: string;
  data?: unknown;
  confirmationType?: 'places' | 'missing_info' | 'transport' | 'candidates';
  intent?: IntentType;
}

export interface AgentQuestionCardData {
  formItems?: { field: string; index: number; question: string; options: string[]; placeholder?: string; value?: string }[];
  summary?: string;
  confirmMode?: boolean;
  tripInfo?: {
    origin?: string;
    destination: string;
    startDate: string;
    endDate: string;
    dayCount: number;
    travelers: string;
    budget: string;
    preferences: string;
  };
}

export interface AgentTripCardData {
  tripId: string;
  title: string;
  destination: string;
  dates: string;
  dayCount: number;
  travelers: string;
  budget: string;
}

export interface AgentDestinationRecommendationCardData {
  title: string;
  intro: string;
  recommendations: { city: string; highlight: string; reason: string }[];
}

export interface AgentPlaceGuideCardData {
  placeName: string;
  title: string;
  intro: string;
  bestTime?: string;
  tips: string[];
  spots: {
    name: string;
    imageUrl: string;
    highlight: string;
    description: string;
    duration: string;
    suitableFor: string;
  }[];
}

export interface AgentExportPayload {
  format: "friend_summary" | "detailed_plan" | "checklist" | "markdown";
  content: string;
  title: string;
  tripId?: string;
  checklistItems?: {
    categoryId: "todo" | "documents" | "clothing" | "electronics";
    label: string;
  }[];
}

export type AgentTimelineCard =
  | { id: string; key: string; kind: "question"; createdAt: string; data: AgentQuestionCardData }
  | { id: string; key: string; kind: "transport"; createdAt: string; data: TransportPlan }
  | { id: string; key: string; kind: "candidates"; createdAt: string; data: SavedPlaceCandidate[] }
  | { id: string; key: string; kind: "trip"; createdAt: string; data: AgentTripCardData }
  | { id: string; key: string; kind: "destination_recommendation"; createdAt: string; data: AgentDestinationRecommendationCardData }
  | { id: string; key: string; kind: "place_guide"; createdAt: string; data: AgentPlaceGuideCardData }
  | { id: string; key: string; kind: "export"; createdAt: string; data: AgentExportPayload };

export interface AgentConfirmRequest {
  threadId: string;
  tripId?: string;
  userId?: string;
  decision: {
    confirmedPlaces?: ConfirmedPlace[];
    removedPlaceIds?: string[];
    transportSelection?: {
      selectedOutboundId?: string;
      selectedReturnId?: string;
    };
    selectedCandidateNames?: string[];
    responses?: Record<string, string>;
  };
}
