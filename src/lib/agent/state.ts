/**
 * TravelAgentState — LangGraph Annotation definition.
 * Each key is annotated as a LastValue channel (most recent write wins).
 */

import { Annotation } from "@langchain/langgraph";
import type {
  IntentType,
  ParsedPlace,
  ConfirmedPlace,
  ItineraryVersion,
  CritiqueResult,
  AgentActionLogEntry,
  InspirationItem,
  SavedPlaceCandidate,
} from "@/types/agent";
import type { Trip, Day } from "@/types/trip";

export const TravelAgentAnnotation = Annotation.Root({
  // === Session ===
  threadId: Annotation<string>(),
  userId: Annotation<string>(),

  // === Loaded Context (from DB) ===
  tripId: Annotation<string>(),
  trip: Annotation<Trip | null>(),

  // === User Input ===
  currentMessage: Annotation<string>(),

  // === Intent ===
  intent: Annotation<IntentType>(),
  intentConfidence: Annotation<number>(),

  // === Parsed Trip Requirements ===
  parsedTripRequirements: Annotation<{
    destination?: string;
    destinationCoord?: { lat: number; lng: number };
    startDate?: string;
    endDate?: string;
    dayCount?: number;
    travelers?: { adults: number; children: number };
    budget?: { min: number; max: number };
    preferences?: string[];
  } | null>(),
  missingInfo: Annotation<string[]>(),

  // === Place Cards ===
  parsedPlaces: Annotation<ParsedPlace[]>(),
  confirmedPlaces: Annotation<ConfirmedPlace[]>(),
  inspirationItems: Annotation<InspirationItem[]>(),
  savedPlaceCandidates: Annotation<SavedPlaceCandidate[]>(),
  selectedSavedPlaces: Annotation<SavedPlaceCandidate[]>(),

  // === Itinerary ===
  itineraryDraft: Annotation<{
    days: Day[];
    overallTips?: string;
    budgetSummary?: Record<string, number>;
  } | null>(),
  critiqueResult: Annotation<CritiqueResult | null>(),

  // === Human-in-the-Loop ===
  needsHumanConfirmation: Annotation<boolean>(),
  pendingConfirmationType: Annotation<"places" | "missing_info" | undefined>(),
  pendingMessage: Annotation<string>(),

  // === Versioning ===
  versions: Annotation<ItineraryVersion[]>(),
  currentVersionNumber: Annotation<number>(),

  // === Response (for frontend) ===
  assistantMessage: Annotation<string>(),
  responsePayload: Annotation<unknown>(),

  // === Conversation Memory ===
  conversationHistory: Annotation<
    { role: "user" | "agent"; content: string }[]
  >(),

  // === Metadata ===
  errors: Annotation<string[]>(),
  actionLog: Annotation<AgentActionLogEntry[]>(),
});

export type TravelAgentState = typeof TravelAgentAnnotation.State;
export type TravelAgentUpdate = typeof TravelAgentAnnotation.Update;
