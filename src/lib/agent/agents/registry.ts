export type SpecialistAgentId =
  | "supervisor_agent"
  | "requirement_agent"
  | "research_agent"
  | "scenic_research_agent"
  | "food_research_agent"
  | "stay_research_agent"
  | "geo_resolver_agent"
  | "planner_agent"
  | "validator_agent"
  | "persistence_agent"
  | "conversation_agent"
  | "export_agent";

export interface SpecialistAgentProfile {
  id: SpecialistAgentId;
  label: string;
  responsibility: string;
}

export const SPECIALIST_AGENTS: Record<SpecialistAgentId, SpecialistAgentProfile> = {
  supervisor_agent: {
    id: "supervisor_agent",
    label: "Supervisor",
    responsibility: "Route each request to the right specialist workflow.",
  },
  requirement_agent: {
    id: "requirement_agent",
    label: "Requirement",
    responsibility: "Parse destination, dates, travelers, budget, preferences, and requested places.",
  },
  research_agent: {
    id: "research_agent",
    label: "Research",
    responsibility: "Gather travel inspiration and build a candidate place pool.",
  },
  scenic_research_agent: {
    id: "scenic_research_agent",
    label: "Scenic Research",
    responsibility: "Research attractions, museums, parks, neighborhoods, views, tickets, and route-worthy sights.",
  },
  food_research_agent: {
    id: "food_research_agent",
    label: "Food Research",
    responsibility: "Research restaurants, snacks, cafes, local specialties, booking hints, and food neighborhoods.",
  },
  stay_research_agent: {
    id: "stay_research_agent",
    label: "Stay Research",
    responsibility: "Research lodging areas, business districts, transport convenience, and base neighborhoods.",
  },
  geo_resolver_agent: {
    id: "geo_resolver_agent",
    label: "Geo Resolver",
    responsibility: "Resolve POI names into addresses, coordinates, opening hours, and ticket hints.",
  },
  planner_agent: {
    id: "planner_agent",
    label: "Planner",
    responsibility: "Generate or revise day-by-day itineraries.",
  },
  validator_agent: {
    id: "validator_agent",
    label: "Validator",
    responsibility: "Normalize itinerary data and critique feasibility, pace, budget, and logistics.",
  },
  persistence_agent: {
    id: "persistence_agent",
    label: "Persistence",
    responsibility: "Save trips, days, activities, versions, and session state.",
  },
  conversation_agent: {
    id: "conversation_agent",
    label: "Conversation",
    responsibility: "Handle general chat and missing-information prompts.",
  },
  export_agent: {
    id: "export_agent",
    label: "Export",
    responsibility: "Format finished itineraries for sharing or export.",
  },
};

const NODE_AGENT_MAP: Record<string, SpecialistAgentId> = {
  load_context: "persistence_agent",
  classify_intent: "supervisor_agent",
  parse_trip: "requirement_agent",
  parse_places: "requirement_agent",
  confirm_places: "requirement_agent",
  collect_missing_info: "conversation_agent",
  ask_follow_up: "conversation_agent",
  recommend_destinations: "research_agent",
  research_inspiration: "research_agent",
  scenic_research: "scenic_research_agent",
  food_research: "food_research_agent",
  stay_research: "stay_research_agent",
  xhs_search: "research_agent",
  web_search: "research_agent",
  extract_places: "research_agent",
  dedupe_candidates: "research_agent",
  poi_enrich: "geo_resolver_agent",
  generate_itinerary: "planner_agent",
  revise_itinerary: "planner_agent",
  normalize_activities: "validator_agent",
  critique_itinerary: "validator_agent",
  save_version: "persistence_agent",
  create_trip: "persistence_agent",
  export_itinerary: "export_agent",
  general_chat: "conversation_agent",
};

export function getSpecialistAgentForNode(nodeName: string): SpecialistAgentProfile {
  const agentId = NODE_AGENT_MAP[nodeName] ?? "supervisor_agent";
  return SPECIALIST_AGENTS[agentId];
}

export function formatAgentNodeName(nodeName: string): string {
  return `${getSpecialistAgentForNode(nodeName).id}.${nodeName}`;
}
