/**
 * Agent Store — Zustand state for the travel planning agent.
 * Tracks SSE streaming, parsed places, itinerary drafts,
 * confirmation state, and critique results.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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
  TransportPlan,
  AgentTimelineCard,
  AgentQuestionCardData,
  AgentTripCardData,
  AgentDestinationRecommendationCardData,
  AgentPlaceGuideCardData,
  AgentExportPayload,
} from "@/types/agent";
import type { Day } from "@/types/trip";

interface AgentMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
}

interface ChatHistoryItem {
  threadId: string;
  title: string;
  updatedAt: string;
  messages: AgentMessage[];
  timelineCards: AgentTimelineCard[];
}

interface ConversationTitleContext {
  destination?: string;
}

type ExportPayload = AgentExportPayload;
type AgentTimelineCardInput = AgentTimelineCard extends infer Card
  ? Card extends AgentTimelineCard
    ? Omit<Card, "id" | "key" | "createdAt">
    : never
  : never;

interface AgentState {
  // Connection
  threadId: string;
  isStreaming: boolean;
  streamingContent: string;

  // Messages
  messages: AgentMessage[];
  chatHistory: ChatHistoryItem[];
  timelineCards: AgentTimelineCard[];

  // Current run state
  currentIntent: IntentType | null;
  currentStep: string | null;

  // Parsed places (from parse_places)
  parsedPlaces: ParsedPlace[];
  confirmedPlaces: ConfirmedPlace[];
  inspirationItems: InspirationItem[];
  savedPlaceCandidates: SavedPlaceCandidate[];
  selectedCandidateNames: string[];
  transportPlan: TransportPlan | null;

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
  confirmationType: "places" | "missing_info" | "transport" | "candidates" | null;
  confirmationMessage: string;

  // Trip card
  tripCard: AgentTripCardData | null;
  questionCard: AgentQuestionCardData | null;
  destinationRecommendationCard: AgentDestinationRecommendationCardData | null;
  placeGuideCard: AgentPlaceGuideCardData | null;
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
  loadConversation: (threadId: string) => void;
  deleteConversation: (threadId: string) => void;

  // Confirmation actions
  confirmPlaces: (places: ConfirmedPlace[], removedIds: string[]) => void;
  rejectPlaces: () => void;
  clearConfirmState: () => void;
  selectTransportOption: (direction: "outbound" | "return", optionId: string) => void;
  toggleCandidateSelection: (name: string) => void;
  clearCandidateSelection: () => void;

  // Reset
  reset: () => void;
}

const initialAgentState = {
  isStreaming: false,
  streamingContent: "",
  messages: [],
  chatHistory: [] as ChatHistoryItem[],
  timelineCards: [] as AgentTimelineCard[],
  currentIntent: null as IntentType | null,
  currentStep: null as string | null,
  parsedPlaces: [] as ParsedPlace[],
  confirmedPlaces: [] as ConfirmedPlace[],
  inspirationItems: [] as InspirationItem[],
  savedPlaceCandidates: [] as SavedPlaceCandidate[],
  selectedCandidateNames: [] as string[],
  transportPlan: null as TransportPlan | null,
  itineraryDraft: null as AgentState["itineraryDraft"],
  versions: [] as ItineraryVersion[],
  critiqueResult: null as CritiqueResult | null,
  needsConfirmation: false,
  confirmationType: null as "places" | "missing_info" | "transport" | "candidates" | null,
  confirmationMessage: "",
  errors: [] as string[],
  tripCard: null,
  questionCard: null,
  destinationRecommendationCard: null,
  placeGuideCard: null,
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

const destinationPatterns = [
  /(?:想去|计划去|准备去|我要去|我想去|去|到)([\u4e00-\u9fa5A-Za-z]{2,12})(?:玩|旅行|旅游|自由行|度假|出差|，|。|,|\.|\s|$)/,
  /([\u4e00-\u9fa5A-Za-z]{2,12})(?:之旅|旅行|旅游|自由行|攻略|行程|路线)/,
];

function cleanDestinationName(value: string) {
  return value
    .replace(/^(一下|一个|一次)/, "")
    .replace(/(玩|旅行|旅游|自由行|攻略|行程|路线|几天|多少天).*$/, "")
    .trim();
}

function inferDestinationFromMessages(messages: AgentMessage[]) {
  const text = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("。");

  for (const pattern of destinationPatterns) {
    const match = text.match(pattern);
    const destination = cleanDestinationName(match?.[1] || "");
    if (destination.length >= 2) return destination;
  }

  return "";
}

function readDestinationFromEventData(data?: Record<string, unknown>) {
  const tripCard = data?.tripCard as AgentState["tripCard"] | undefined;
  if (tripCard?.destination) return tripCard.destination;

  const questionCard = data?.questionCard as AgentState["questionCard"] | undefined;
  if (questionCard?.tripInfo?.destination) return questionCard.tripInfo.destination;

  const transportPlan = data?.transportPlan as TransportPlan | undefined;
  if (transportPlan?.destination) return transportPlan.destination;

  const savedPlaceCandidates = data?.savedPlaceCandidates as SavedPlaceCandidate[] | undefined;
  if (savedPlaceCandidates?.[0]?.city) return savedPlaceCandidates[0].city;

  return "";
}

function buildConversationTitle(messages: AgentMessage[], context?: ConversationTitleContext) {
  const destination = cleanDestinationName(context?.destination || "") || inferDestinationFromMessages(messages);
  if (destination) return `${destination}之旅`;

  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUserMessage) return "新对话";
  if (/推荐|去哪|哪里|目的地/.test(firstUserMessage)) return "目的地灵感";
  if (/检查|优化|太赶|放松|雨天|备份/.test(firstUserMessage)) return "行程优化";
  if (/导出|清单|攻略/.test(firstUserMessage)) return "行程整理";
  return firstUserMessage.length > 12 ? `${firstUserMessage.slice(0, 12)}...` : firstUserMessage;
}

function upsertConversation(
  history: ChatHistoryItem[],
  threadId: string,
  messages: AgentMessage[],
  timelineCards: AgentTimelineCard[],
  context?: ConversationTitleContext
) {
  if (messages.length === 0 && timelineCards.length === 0) return history;
  const item: ChatHistoryItem = {
    threadId,
    title: buildConversationTitle(messages, context),
    updatedAt: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
    messages,
    timelineCards,
  };
  return [
    item,
    ...history.filter((conversation) => conversation.threadId !== threadId),
  ].slice(0, 3);
}

function createTimelineCardId(kind: AgentTimelineCard["kind"]) {
  return `agent-card-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function timelineCardKey(card: AgentTimelineCardInput) {
  if (card.kind === "transport") {
    return `transport:${card.data.origin}:${card.data.destination}:${card.data.departDate}:${card.data.returnDate ?? ""}`;
  }
  if (card.kind === "candidates") {
    return `candidates:${card.data.map((candidate) => candidate.name).join("|")}`;
  }
  if (card.kind === "question") {
    const info = card.data.tripInfo;
    return info
      ? `question:${info.origin ?? ""}:${info.destination}:${info.startDate}:${info.endDate}:${info.preferences}`
      : `question:${card.data.formItems?.map((item) => `${item.field}:${item.value ?? ""}`).join("|") ?? ""}`;
  }
  if (card.kind === "trip") return `trip:${card.data.tripId}`;
  if (card.kind === "destination_recommendation") return `destination:${card.data.title}`;
  if (card.kind === "place_guide") return `place-guide:${card.data.placeName}:${card.data.title}`;
  return `export:${card.data.format}:${card.data.title}`;
}

function upsertTimelineCard(
  timelineCards: AgentTimelineCard[],
  card: AgentTimelineCardInput
) {
  const key = timelineCardKey(card);
  const existingIndex = timelineCards.findIndex((item) => item.key === key);
  if (existingIndex >= 0) {
    return timelineCards.map((item, index) =>
      index === existingIndex ? { ...item, data: card.data } as AgentTimelineCard : item
    );
  }
  return [
    ...timelineCards,
    {
      ...card,
      id: createTimelineCardId(card.kind),
      key,
      createdAt: new Date().toISOString(),
    } as AgentTimelineCard,
  ];
}

function upsertTimelineCards(
  timelineCards: AgentTimelineCard[],
  cards: AgentTimelineCardInput[]
) {
  return cards.reduce(upsertTimelineCard, timelineCards);
}

function clearTimelineCardsByKind(
  timelineCards: AgentTimelineCard[],
  kind: AgentTimelineCard["kind"]
) {
  return timelineCards.filter((card) => card.kind !== kind);
}

function readTimelineCardsFromData(data: Record<string, unknown>) {
  const cards: AgentTimelineCardInput[] = [];
  if (data.questionCard) {
    cards.push({ kind: "question", data: data.questionCard as AgentQuestionCardData });
  }
  if (data.transportPlan) {
    cards.push({ kind: "transport", data: data.transportPlan as TransportPlan });
  }
  if (data.savedPlaceCandidates && Array.isArray(data.savedPlaceCandidates) && data.savedPlaceCandidates.length > 0) {
    cards.push({ kind: "candidates", data: data.savedPlaceCandidates as SavedPlaceCandidate[] });
  }
  if (data.tripCard) {
    cards.push({ kind: "trip", data: data.tripCard as AgentTripCardData });
  }
  if (data.destinationRecommendationCard) {
    cards.push({
      kind: "destination_recommendation",
      data: data.destinationRecommendationCard as AgentDestinationRecommendationCardData,
    });
  }
  if (data.placeGuideCard) {
    cards.push({ kind: "place_guide", data: data.placeGuideCard as AgentPlaceGuideCardData });
  }
  if (data.exportPayload) {
    cards.push({ kind: "export", data: data.exportPayload as AgentExportPayload });
  }
  return cards;
}

export const useAgentStore = create<AgentState>()(
persist(
  (set, get) => ({
  threadId: getInitialThreadId(),
  ...initialAgentState,

  setThreadId: (id) => {
    set({ threadId: id });
  },

  addMessage: (msg) =>
    set((s) => {
      const messages = [...s.messages, msg];
      return {
        messages,
        chatHistory: upsertConversation(s.chatHistory, s.threadId, messages, s.timelineCards),
      };
    }),

  setStreaming: (streaming) =>
    set(streaming
      ? {
          isStreaming: true,
          streamingContent: "",
        }
      : { isStreaming: false }
    ),

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
          const cards = readTimelineCardsFromData(data);
          if (data.questionCard) {
            updates.questionCard = data.questionCard as AgentState["questionCard"];
            updates.destinationRecommendationCard = null;
            updates.placeGuideCard = null;
          }
          if (data.destinationRecommendationCard) {
            updates.destinationRecommendationCard =
              data.destinationRecommendationCard as AgentState["destinationRecommendationCard"];
            updates.questionCard = null;
            updates.placeGuideCard = null;
          }
          if (data.placeGuideCard) {
            updates.placeGuideCard = data.placeGuideCard as AgentState["placeGuideCard"];
            updates.questionCard = null;
            updates.destinationRecommendationCard = null;
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
            updates.selectedCandidateNames = [];
          }
          if (data.transportPlan) {
            updates.transportPlan = data.transportPlan as TransportPlan;
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
          set((s) => {
            let timelineCards = cards.length
              ? upsertTimelineCards(s.timelineCards, cards)
              : s.timelineCards;
            if ("questionCard" in data && !data.questionCard) {
              timelineCards = clearTimelineCardsByKind(timelineCards, "question");
            }
            return {
              ...updates,
              timelineCards,
              chatHistory: cards.length
                ? upsertConversation(s.chatHistory, s.threadId, s.messages, timelineCards)
                : s.chatHistory,
            };
          });
        }
        if (event.message) {
          set({ streamingContent: event.message });
        }
        break;

      case "awaiting_confirmation":
        if (event.message) {
          const msg: AgentMessage = {
            id: `agent-msg-${Date.now()}`,
            role: "agent",
            content: event.message,
            timestamp: new Date().toISOString(),
          };
          set((s) => {
            const messages = [...s.messages, msg];
            return {
              messages,
              chatHistory: upsertConversation(s.chatHistory, s.threadId, messages, s.timelineCards),
            };
          });
        }
        {
          const eventData = event.data ? (event.data as Record<string, unknown>) : {};
          const cards = readTimelineCardsFromData(eventData);
          set((s) => {
            const timelineCards = cards.length
              ? upsertTimelineCards(s.timelineCards, cards)
              : s.timelineCards;
            return {
              needsConfirmation: true,
              confirmationType: event.confirmationType ?? "places",
              confirmationMessage: event.message ?? "",
              parsedPlaces:
                (event.data as { parsedPlaces?: ParsedPlace[] })
                  ?.parsedPlaces ?? get().parsedPlaces,
              transportPlan:
                (event.data as { transportPlan?: TransportPlan })
                  ?.transportPlan ?? get().transportPlan,
              inspirationItems:
                (event.data as { inspirationItems?: InspirationItem[] })
                  ?.inspirationItems ?? get().inspirationItems,
              savedPlaceCandidates:
                (event.data as { savedPlaceCandidates?: SavedPlaceCandidate[] })
                  ?.savedPlaceCandidates ?? get().savedPlaceCandidates,
              selectedCandidateNames:
                event.confirmationType === "candidates" ? [] : get().selectedCandidateNames,
              isStreaming: false,
              timelineCards,
              chatHistory: cards.length
                ? upsertConversation(s.chatHistory, s.threadId, s.messages, timelineCards)
                : s.chatHistory,
            };
          });
        }
        break;

      case "complete":
        const completeData = event.data ? (event.data as Record<string, unknown>) : undefined;
        const eventDestination = readDestinationFromEventData(completeData);
        set({
          isStreaming: false,
          currentIntent: event.intent ?? null,
          needsConfirmation: false,
          confirmationType: null,
          confirmationMessage: "",
        });
        // Add agent response as a message
        if (event.message) {
          const msg: AgentMessage = {
            id: `agent-msg-${Date.now()}`,
            role: "agent",
            content: event.message,
            timestamp: new Date().toISOString(),
          };
          set((s) => {
            const messages = [...s.messages, msg];
            return {
              messages,
              chatHistory: upsertConversation(s.chatHistory, s.threadId, messages, s.timelineCards, {
                destination: eventDestination,
              }),
            };
          });
        }
        // Sync state from complete event
        if (completeData) {
          const data = completeData;
          const updates: Partial<AgentState> = {};
          const cards = readTimelineCardsFromData(data);
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
          if (data.transportPlan)
            updates.transportPlan = data.transportPlan as TransportPlan;
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
          if ("questionCard" in data) {
            updates.questionCard = data.questionCard as AgentState["questionCard"];
            if (data.questionCard) updates.destinationRecommendationCard = null;
            if (data.questionCard) updates.placeGuideCard = null;
          }
          if ("destinationRecommendationCard" in data) {
            updates.destinationRecommendationCard =
              data.destinationRecommendationCard as AgentState["destinationRecommendationCard"];
            if (data.destinationRecommendationCard) updates.questionCard = null;
            if (data.destinationRecommendationCard) updates.placeGuideCard = null;
          }
          if ("placeGuideCard" in data) {
            updates.placeGuideCard = data.placeGuideCard as AgentState["placeGuideCard"];
            if (data.placeGuideCard) {
              updates.questionCard = null;
              updates.destinationRecommendationCard = null;
            }
          }
          if ("tripCard" in data) {
            updates.tripCard = data.tripCard as AgentState["tripCard"];
            if (data.tripCard) {
              updates.questionCard = null; // Clear stale question card when trip is created
              updates.destinationRecommendationCard = null;
              updates.placeGuideCard = null;
            }
          }
          if (data.exportPayload)
            updates.exportPayload = data.exportPayload as ExportPayload;
          else if (event.intent !== "exportItinerary")
            updates.exportPayload = null;
          set((s) => {
            const timelineCards = cards.length
              ? upsertTimelineCards(s.timelineCards, cards)
              : s.timelineCards;
            return {
              ...updates,
              timelineCards,
              chatHistory: cards.length
                ? upsertConversation(s.chatHistory, s.threadId, s.messages, timelineCards, {
                  destination: eventDestination,
                })
                : s.chatHistory,
            };
          });
          if (eventDestination) {
            set((s) => ({
              chatHistory: upsertConversation(s.chatHistory, s.threadId, s.messages, s.timelineCards, {
                destination: eventDestination,
              }),
            }));
          }
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

  loadConversation: (threadId) => {
    const conversation = get().chatHistory.find((item) => item.threadId === threadId);
    if (!conversation) return;
    set({
      threadId: conversation.threadId,
      messages: conversation.messages,
      timelineCards: conversation.timelineCards ?? [],
      isStreaming: false,
      streamingContent: "",
      currentStep: null,
      needsConfirmation: false,
      confirmationType: null,
      confirmationMessage: "",
      questionCard: null,
      destinationRecommendationCard: null,
      placeGuideCard: null,
      exportPayload: null,
    });
  },

  deleteConversation: (threadId) => {
    set((s) => {
      const chatHistory = s.chatHistory.filter((item) => item.threadId !== threadId);
      if (s.threadId !== threadId) return { chatHistory };
      return {
        threadId: createThreadId(),
        ...initialAgentState,
        chatHistory,
      };
    });
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

  selectTransportOption: (direction, optionId) => {
    set((s) => {
      if (!s.transportPlan) return {};
      return {
        transportPlan: {
          ...s.transportPlan,
          selectedOutboundId:
            direction === "outbound" ? optionId : s.transportPlan.selectedOutboundId,
          selectedReturnId:
            direction === "return" ? optionId : s.transportPlan.selectedReturnId,
        },
        timelineCards: s.timelineCards.map((card) =>
          card.kind === "transport"
            ? {
              ...card,
              data: {
                ...card.data,
                selectedOutboundId:
                  direction === "outbound" ? optionId : card.data.selectedOutboundId,
                selectedReturnId:
                  direction === "return" ? optionId : card.data.selectedReturnId,
              },
            }
            : card
        ),
      };
    });
  },

  toggleCandidateSelection: (name) => {
    set((s) => {
      const candidates = s.savedPlaceCandidates ?? [];
      const selected = new Set(s.selectedCandidateNames ?? []);
      if (selected.has(name)) selected.delete(name);
      else selected.add(name);
      return {
        selectedCandidateNames: [...selected].filter((candidateName) =>
          candidates.some((candidate) => candidate.name === candidateName)
        ),
      };
    });
  },

  clearCandidateSelection: () => set({ selectedCandidateNames: [] }),

  reset: () => {
    const threadId = createThreadId();
    set({
      threadId,
      ...initialAgentState,
      chatHistory: get().chatHistory,
    });
  },
}),
  {
    name: "nomtrail-agent-history",
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      threadId: state.threadId,
      messages: state.messages,
      timelineCards: state.timelineCards,
      chatHistory: state.chatHistory,
    }),
  }
));
