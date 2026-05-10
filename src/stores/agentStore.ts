/**
 * Agent Store — Zustand state for the travel planning agent.
 * Tracks SSE streaming, parsed places, itinerary drafts,
 * confirmation state, and critique results.
 */

import { create } from "zustand";
import type {
  IntentType,
  ParsedPlace,
  ConfirmedPlace,
  ItineraryVersion,
  CritiqueResult,
  AgentRunSSEEvent,
  AgentActionLogEntry,
  InspirationItem,
  SavedPlaceCandidate,
} from "@/types/agent";
import type { Day } from "@/types/trip";

interface AgentMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
}

interface ExportPayload {
  format: "friend_summary" | "detailed_plan" | "checklist" | "markdown";
  content: string;
  title: string;
}

interface AgentState {
  // Connection
  threadId: string;
  isStreaming: boolean;
  streamingContent: string;

  // Messages
  messages: AgentMessage[];

  // Current run state
  currentIntent: IntentType | null;
  currentStep: string | null;

  // Parsed places (from parse_places)
  parsedPlaces: ParsedPlace[];
  confirmedPlaces: ConfirmedPlace[];
  inspirationItems: InspirationItem[];
  savedPlaceCandidates: SavedPlaceCandidate[];

  // Itinerary
  itineraryDraft: {
    days: Day[];
    overallTips?: string;
    budgetSummary?: Record<string, number>;
  } | null;
  versions: ItineraryVersion[];

  // Critique
  critiqueResult: CritiqueResult | null;

  // Human-in-the-loop
  needsConfirmation: boolean;
  confirmationType: "places" | "missing_info" | null;
  confirmationMessage: string;

  // Trip card
  tripCard: {
    tripId: string; title: string; destination: string;
    dates: string; dayCount: number; travelers: string; budget: string;
  } | null;
  questionCard: {
    formItems?: { field: string; index: number; question: string; options: string[]; placeholder?: string; value?: string }[];
    summary?: string;
    confirmMode?: boolean;
    tripInfo?: {
      destination: string; startDate: string; endDate: string;
      dayCount: number; travelers: string; budget: string; preferences: string;
    };
  } | null;
  destinationRecommendationCard: {
    title: string;
    intro: string;
    recommendations: { city: string; highlight: string; reason: string }[];
  } | null;
  exportPayload: ExportPayload | null;

  // Errors
  errors: string[];
  currentVersionNumber: number;
  actionLog: AgentActionLogEntry[];

  // Actions
  setThreadId: (id: string) => void;
  addMessage: (msg: AgentMessage) => void;
  setStreaming: (streaming: boolean) => void;
  handleSSEEvent: (event: AgentRunSSEEvent) => void;

  // Confirmation actions
  confirmPlaces: (places: ConfirmedPlace[], removedIds: string[]) => void;
  rejectPlaces: () => void;
  clearConfirmState: () => void;

  // Reset
  reset: () => void;
}

const initialAgentState = {
  isStreaming: false,
  streamingContent: "",
  messages: [],
  currentIntent: null as IntentType | null,
  currentStep: null as string | null,
  parsedPlaces: [] as ParsedPlace[],
  confirmedPlaces: [] as ConfirmedPlace[],
  inspirationItems: [] as InspirationItem[],
  savedPlaceCandidates: [] as SavedPlaceCandidate[],
  itineraryDraft: null as AgentState["itineraryDraft"],
  versions: [] as ItineraryVersion[],
  critiqueResult: null as CritiqueResult | null,
  needsConfirmation: false,
  confirmationType: null as "places" | "missing_info" | null,
  confirmationMessage: "",
  errors: [] as string[],
  tripCard: null,
  questionCard: null,
  destinationRecommendationCard: null,
  exportPayload: null,
  currentVersionNumber: 0,
  actionLog: [] as AgentActionLogEntry[],
};

function createThreadId() {
  return `agent-${Date.now()}`;
}

function getInitialThreadId() {
  return createThreadId();
}

export const useAgentStore = create<AgentState>((set, get) => ({
  threadId: getInitialThreadId(),
  ...initialAgentState,

  setThreadId: (id) => {
    set({ threadId: id });
  },

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  setStreaming: (streaming) =>
    set({ isStreaming: streaming }),

  handleSSEEvent: (event) => {
    switch (event.type) {
      case "step":
        set({
          currentStep: event.node ?? null,
          streamingContent: event.message ?? "",
        });
        break;

      case "chunk":
        if (event.data) {
          const data = event.data as Record<string, unknown>;
          const updates: Partial<AgentState> = {};
          if (data.questionCard) {
            updates.questionCard = data.questionCard as AgentState["questionCard"];
            updates.destinationRecommendationCard = null;
          }
          if (data.destinationRecommendationCard) {
            updates.destinationRecommendationCard =
              data.destinationRecommendationCard as AgentState["destinationRecommendationCard"];
            updates.questionCard = null;
          }
          if (data.parsedPlaces) {
            updates.parsedPlaces = data.parsedPlaces as ParsedPlace[];
          }
          if (data.inspirationItems) {
            updates.inspirationItems = data.inspirationItems as InspirationItem[];
          }
          if (data.savedPlaceCandidates) {
            updates.savedPlaceCandidates =
              data.savedPlaceCandidates as SavedPlaceCandidate[];
          }
          if (data.itineraryDraft) {
            updates.itineraryDraft =
              data.itineraryDraft as AgentState["itineraryDraft"];
          }
          if (data.critiqueResult) {
            updates.critiqueResult =
              data.critiqueResult as CritiqueResult;
          }
          if (data.exportPayload) {
            updates.exportPayload = data.exportPayload as ExportPayload;
          }
          set(updates);
        }
        if (event.message) {
          set({ streamingContent: event.message });
        }
        break;

      case "awaiting_confirmation":
        set({
          needsConfirmation: true,
          confirmationType: event.confirmationType ?? "places",
          confirmationMessage: event.message ?? "",
          parsedPlaces:
            (event.data as { parsedPlaces?: ParsedPlace[] })
              ?.parsedPlaces ?? get().parsedPlaces,
          isStreaming: false,
        });
        break;

      case "complete":
        set({
          isStreaming: false,
          currentIntent: event.intent ?? null,
        });
        // Add agent response as a message
        if (event.message) {
          const msg: AgentMessage = {
            id: `agent-msg-${Date.now()}`,
            role: "agent",
            content: event.message,
            timestamp: new Date().toISOString(),
          };
          set((s) => ({ messages: [...s.messages, msg] }));
        }
        // Sync state from complete event
        if (event.data) {
          const data = event.data as Record<string, unknown>;
          const updates: Partial<AgentState> = {};
          if (data.parsedPlaces)
            updates.parsedPlaces = data.parsedPlaces as ParsedPlace[];
          if (data.confirmedPlaces)
            updates.confirmedPlaces =
              data.confirmedPlaces as ConfirmedPlace[];
          if (data.inspirationItems)
            updates.inspirationItems = data.inspirationItems as InspirationItem[];
          if (data.savedPlaceCandidates)
            updates.savedPlaceCandidates =
              data.savedPlaceCandidates as SavedPlaceCandidate[];
          if (data.itineraryDraft)
            updates.itineraryDraft =
              data.itineraryDraft as AgentState["itineraryDraft"];
          if (data.critiqueResult)
            updates.critiqueResult =
              data.critiqueResult as CritiqueResult;
          if (data.versions)
            updates.versions = data.versions as ItineraryVersion[];
          if (data.errors)
            updates.errors = data.errors as string[];
          if (data.actionLog)
            updates.actionLog = data.actionLog as AgentActionLogEntry[];
          if (typeof data.currentVersionNumber === "number")
            updates.currentVersionNumber = data.currentVersionNumber;
          if (data.questionCard) {
            updates.questionCard = data.questionCard as AgentState["questionCard"];
            updates.destinationRecommendationCard = null;
          }
          if (data.destinationRecommendationCard) {
            updates.destinationRecommendationCard =
              data.destinationRecommendationCard as AgentState["destinationRecommendationCard"];
            updates.questionCard = null;
          }
          if (data.tripCard) {
            updates.tripCard = data.tripCard as AgentState["tripCard"];
            updates.questionCard = null; // Clear stale question card when trip is created
            updates.destinationRecommendationCard = null;
          }
          if (data.exportPayload)
            updates.exportPayload = data.exportPayload as ExportPayload;
          else if (event.intent !== "exportItinerary")
            updates.exportPayload = null;
          set(updates);
        }
        set({ streamingContent: "" });
        break;

      case "error":
        set({
          isStreaming: false,
          errors: [...get().errors, event.message ?? "Unknown error"],
          streamingContent: "",
        });
        break;
    }
  },

  confirmPlaces: (places, removedIds) => {
    const filtered = places.filter((p) => !removedIds.includes(p.id));
    set({
      confirmedPlaces: filtered,
      needsConfirmation: false,
      confirmationType: null,
    });
  },

  rejectPlaces: () => {
    set({
      parsedPlaces: [],
      needsConfirmation: false,
      confirmationType: null,
    });
  },

  clearConfirmState: () => {
    set({
      needsConfirmation: false,
      confirmationType: null,
      confirmationMessage: "",
    });
  },

  reset: () => {
    const threadId = createThreadId();
    set({
      threadId,
      ...initialAgentState,
    });
  },
}));
