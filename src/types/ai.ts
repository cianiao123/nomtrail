import { Day, Activity, PreferenceTag, ValidationWarning } from './trip';

export interface AIGenerateRequest {
  requirements: {
    destination: string;
    destinationCoord: { lat: number; lng: number };
    startDate: string;
    endDate: string;
    travelers: { adults: number; children: number };
    budget: { min: number; max: number };
    preferences: PreferenceTag[];
    naturalLanguageInput: string;
  };
  tripId?: string;
}

export type StepType = 'parse' | 'poi_search' | 'generate' | 'validate';

export interface SSEStepEvent {
  type: 'step';
  step: number;
  label: string;
  stepType: StepType;
}

export interface SSEPartialDayEvent {
  type: 'day_chunk';
  dayIndex: number;
  activities: Activity[];
}

export interface SSEWarningEvent {
  type: 'warning';
  warning: ValidationWarning;
}

export interface SSECompleteEvent {
  type: 'complete';
  trip: { id: string; days: Day[] };
}

export interface SSEErrorEvent {
  type: 'error';
  message: string;
}

export type SSEEvent =
  | SSEStepEvent
  | SSEPartialDayEvent
  | SSEWarningEvent
  | SSECompleteEvent
  | SSEErrorEvent;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tripId?: string;
}

export interface AIChatRequest {
  message: string;
  tripId?: string;
  history?: ChatMessage[];
}

export interface AIOptimizeRequest {
  tripId: string;
  instructions?: string;
}

// ValidationWarning is now in trip.ts
