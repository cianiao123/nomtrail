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
  confirmationType?: 'places' | 'missing_info';
  intent?: IntentType;
}

export interface AgentConfirmRequest {
  threadId: string;
  tripId?: string;
  userId?: string;
  decision: {
    confirmedPlaces?: ConfirmedPlace[];
    removedPlaceIds?: string[];
    responses?: Record<string, string>;
  };
}
