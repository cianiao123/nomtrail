/**
 * LangGraph StateGraph for Travel Planning Agent.
 *
 * Architecture:
 *   A supervisor graph routes requests across specialist agents:
 *   requirement_agent, research_agent, geo_resolver_agent, planner_agent,
 *   validator_agent, persistence_agent, conversation_agent, and export_agent.
 *   Each specialist is represented by one or more graph nodes and records
 *   agent-prefixed action logs, e.g. research_agent.web_search.
 *
 * Graph:
 *   START → load_context → classify_intent → route_by_intent
 *     ├── parseTrip → parse_trip → collect_missing_info → END
 *     ├── parsePlaces → parse_places → confirm_places → (checkpoint) → END
 *     ├── recommendDestinations → recommend_destinations → END
 *     ├── generalChat → general_chat → END
 *     ├── generateItinerary → generate → critique → save → END
 *     ├── reviseItinerary → revise → save → END
 *     ├── critiqueItinerary → critique → END
 *     ├── exportItinerary → export → END
 *     └── generalChat → collect_missing_info → END
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { TravelAgentAnnotation } from "./state";
import type { TravelAgentState } from "./state";
import { isConstrainedServerlessRuntime } from "./runtime";
import {
  loadContextNode,
  classifyIntentNode,
  parsePlacesNode,
  recommendDestinationsNode,
  generalChatNode,
  confirmPlacesNode,
  researchInspirationNode,
  generateItineraryNode,
  critiqueItineraryNode,
  reviseItineraryNode,
  saveVersionNode,
  exportItineraryNode,
  parseTripNode,
  collectMissingInfoNode,
  createTripNode,
  normalizeActivitiesNode,
} from "./nodes";

function routeByIntent(state: TravelAgentState): string {
  const hasItinerary = !!state.itineraryDraft?.days?.length || (state.versions?.length ?? 0) > 0;

  switch (state.intent) {
    case "parseTrip": {
      return "parse_trip";
    }
    case "parsePlaces":
      return "parse_places";
    case "recommendDestinations":
      return "recommend_destinations";
    case "generateItinerary": {
      // Full pipeline: generate → normalize → critique → save → create_trip
      const reqs = state.parsedTripRequirements;
      if (state.confirmedPlaces?.length) return "research_inspiration";
      if (state.parsedPlaces?.length) return "confirm_places";
      if (state.trip || reqs?.destination) return "research_inspiration";
      return "collect_missing_info";
    }
    case "reviseItinerary":
      return hasItinerary || !!state.trip || !!state.tripId ? "revise_itinerary" : "collect_missing_info";
    case "critiqueItinerary":
      return hasItinerary ? "critique_itinerary" : "collect_missing_info";
    case "exportItinerary":
      return hasItinerary ? "export_itinerary" : "collect_missing_info";
    case "generalChat":
      return "general_chat";
    default:
      return "general_chat";
  }
}

function routeAfterParseTrip(): string {
  // Always go through collect_missing_info so user gets a proper response
  return "collect_missing_info";
}

function routeAfterConfirm(state: TravelAgentState): string {
  if (state.needsHumanConfirmation) return END;
  if (!state.confirmedPlaces?.length) return END;
  if (state.trip || state.tripId || state.itineraryDraft?.days?.length || (state.versions?.length ?? 0) > 0) {
    return "revise_itinerary";
  }
  return state.parsedTripRequirements?.destination
    ? "research_inspiration"
    : END;
}

function shouldSkipPostGenerationChecks(): boolean {
  return isConstrainedServerlessRuntime();
}

function routeAfterCollectMissing(state: TravelAgentState): string {
  // If a confirm card is being shown, stop and wait for user
  if ((state.responsePayload as Record<string,unknown>)?.confirmMode) return END;
  if ((state.responsePayload as Record<string,unknown>)?.type === "question_card") return END;

  const reqs = state.parsedTripRequirements;
  const hasEnoughTripInfo = !!reqs?.destination
    && !!(reqs.dayCount || (reqs.startDate && reqs.endDate))
    && !!reqs.preferences?.length;
  const wantsGeneration = /直接|开始|生成|规划|安排|帮我/.test(state.currentMessage ?? "");

  if (hasEnoughTripInfo && wantsGeneration) {
    return "research_inspiration";
  }
  return END;
}

function routeAfterGenerate(state: TravelAgentState): string {
  const deadline = state.requestDeadlineAt;
  const remaining = typeof deadline === "number" ? deadline - Date.now() : 60000;
  return shouldSkipPostGenerationChecks() || remaining < 12000 ? "save_version" : "normalize_activities";
}

function routeAfterSave(state: TravelAgentState): string {
  // After saving a version, create the trip if it doesn't exist yet
  if (!state.tripId && !state.trip && state.itineraryDraft?.days?.length) return "create_trip";
  return END;
}

export const travelAgentGraph = new StateGraph(TravelAgentAnnotation)
  .addNode("load_context", loadContextNode)
  .addNode("classify_intent", classifyIntentNode)
  .addNode("parse_places", parsePlacesNode)
  .addNode("recommend_destinations", recommendDestinationsNode)
  .addNode("general_chat", generalChatNode)
  .addNode("confirm_places", confirmPlacesNode)
  .addNode("research_inspiration", researchInspirationNode)
  .addNode("generate_itinerary", generateItineraryNode)
  .addNode("critique_itinerary", critiqueItineraryNode)
  .addNode("revise_itinerary", reviseItineraryNode)
  .addNode("save_version", saveVersionNode)
  .addNode("export_itinerary", exportItineraryNode)
  .addNode("parse_trip", parseTripNode)
  .addNode("collect_missing_info", collectMissingInfoNode)
  .addNode("create_trip", createTripNode)
  .addNode("normalize_activities", normalizeActivitiesNode)

  .addEdge(START, "load_context")
  .addEdge("load_context", "classify_intent")

  .addConditionalEdges("classify_intent", routeByIntent, {
    parse_trip: "parse_trip",
    create_trip: "create_trip",
    parse_places: "parse_places",
    recommend_destinations: "recommend_destinations",
    general_chat: "general_chat",
    research_inspiration: "research_inspiration",
    generate_itinerary: "generate_itinerary",
    revise_itinerary: "revise_itinerary",
    critique_itinerary: "critique_itinerary",
    export_itinerary: "export_itinerary",
    confirm_places: "confirm_places",
    collect_missing_info: "collect_missing_info",
  })

  // parseTrip → (missing info? → collect : END)
  .addConditionalEdges("parse_trip", routeAfterParseTrip, {
    collect_missing_info: "collect_missing_info",
    [END]: END,
  })

  // parsePlaces → confirm → (confirmed? → generate : END)
  .addEdge("parse_places", "confirm_places")
  .addConditionalEdges("confirm_places", routeAfterConfirm, {
    research_inspiration: "research_inspiration",
    revise_itinerary: "revise_itinerary",
    generate_itinerary: "generate_itinerary",
    [END]: END,
  })

  // inspiration → generate → normalize → critique → save → (create trip if new)
  .addEdge("research_inspiration", "generate_itinerary")
  .addConditionalEdges("generate_itinerary", routeAfterGenerate, {
    normalize_activities: "normalize_activities",
    save_version: "save_version",
  })
  .addEdge("normalize_activities", "critique_itinerary")
  .addEdge("critique_itinerary", "save_version")
  .addEdge("revise_itinerary", "save_version")
  .addConditionalEdges("save_version", routeAfterSave, {
    create_trip: "create_trip",
    [END]: END,
  })

  // Direct paths
  .addEdge("recommend_destinations", END)
  .addEdge("general_chat", END)
  .addEdge("export_itinerary", END)
  .addConditionalEdges("collect_missing_info", routeAfterCollectMissing, {
    research_inspiration: "research_inspiration",
    create_trip: "create_trip",
    generate_itinerary: "generate_itinerary",
    [END]: END,
  })
  .addEdge("create_trip", END)

  .compile();
