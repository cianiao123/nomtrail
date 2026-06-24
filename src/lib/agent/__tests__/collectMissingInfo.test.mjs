import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const modulePath = path.resolve("src/lib/agent/nodes.ts");
const requireFromModule = createRequire(modulePath);

function loadNodesModule() {
  const source = fs.readFileSync(modulePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const cjsModule = { exports: {} };
  const customRequire = (specifier) => {
    if (specifier === "@/lib/db/supabase") return { db: { query: async () => [] } };
    if (specifier === "@/lib/llm/deepseekClient") return { deepseekClient: {} };
    if (specifier === "./tools") {
      return {
        searchMultiplePlaces: async () => ({}),
        buildEnrichedContext: () => "",
        detectXHSReference: () => false,
        extractPlacesFromXHS: async () => "",
        fetchXHSNote: async () => [],
        searchTravelInspiration: async () => ({
          inspirationItems: [],
          savedPlaceCandidates: [],
          debug: { xhsCount: 0, webCount: 0, enrichedCount: 0, verticals: [] },
        }),
      };
    }
    if (specifier === "./wishlist") {
      return {
        appendMissingWishlistActivities: (days) => days,
        extractWishlistNamesFromContext: () => [],
        isWishlistActivity: () => false,
        markWishlistNotes: (value) => value,
        markWishlistSource: (value) => value,
        mergeWishlistCandidates: (value) => value,
        normalizeWishlistName: (value) => String(value || "").trim(),
      };
    }
    if (specifier === "./schemas") {
      return {
        IntentResultSchema: {},
        ParsePlacesResultSchema: {},
        ParseTripResultSchema: {},
        GenerateItineraryResultSchema: {},
        ReviseItineraryResultSchema: {},
        RecommendDestinationsResultSchema: {},
        PlaceGuideResultSchema: {},
        MissingInfoResponseSchema: {},
        CritiqueResultSchema: {},
        NormalizeActivitiesResultSchema: {},
        validateWithSchema: (_schema, value) => value,
      };
    }
    if (specifier === "./prompts") {
      return {
        INTENT_CLASSIFY_PROMPT: "",
        PARSE_PLACES_PROMPT: "",
        PARSE_TRIP_PROMPT: "",
        RECOMMEND_DESTINATIONS_PROMPT: "",
        PLACE_GUIDE_PROMPT: "",
        ITINERARY_AGENT_PROMPT: "",
        REVISE_PROMPT: "",
        ASK_FOLLOWUP_PROMPT: "",
        CRITIQUE_PROMPT: "",
        NORMALIZE_ACTIVITIES_PROMPT: "",
      };
    }
    if (specifier === "./runtime") {
      return {
        isConstrainedServerlessRuntime: () => false,
        isRequestTerminationError: () => false,
      };
    }
    if (specifier === "@/lib/weather/amapWeather") {
      return {
        AMAP_GEOCODE_URL: "",
        AMAP_WEATHER_URL: "",
        buildAmapGeocodeParams: () => "",
        buildAmapWeatherParams: () => "",
        normalizeAmapWeatherResponse: (value) => value,
        readAdcodeFromGeocodeResponse: () => "",
      };
    }
    if (specifier === "./weatherIntent") {
      return { formatWeatherAnswer: () => "", parseWeatherQuery: () => null };
    }
    if (specifier === "@/lib/poi/amapRoute") return { fetchAmapRoute: async () => null };
    if (specifier === "@/lib/trips/localTripStore") return { saveLocalTrip: (trip) => trip };
    if (specifier === "./agents/registry") return { formatAgentNodeName: (name) => name };
    if (specifier === "./transport") {
      return {
        createTransportPlanFromMessage: () => null,
        createTransportPlanFromMessages: () => null,
        createTransportPlanFromRequirements: () => null,
        normalizeTransportDate: (value) => value,
        parseTransportRequest: () => null,
      };
    }
    if (specifier === "@supabase/supabase-js") return { createClient: () => ({}) };
    return requireFromModule(specifier);
  };

  vm.runInNewContext(
    outputText,
    {
      module: cjsModule,
      exports: cjsModule.exports,
      require: customRequire,
      process: { env: {} },
      console,
      crypto: { randomUUID: () => "test-id" },
      Date,
      URLSearchParams,
      fetch: async () => ({ json: async () => ({}) }),
      setTimeout,
      AbortController,
      DOMException,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

const completeTripState = {
  threadId: "test-thread",
  currentMessage: "从上海出发，想去北京，计划玩3天，2个成人，预算3000-8000元，偏好休闲度假，直接帮我规划",
  intent: "parseTrip",
  parsedTripRequirements: {
    origin: "上海",
    destination: "北京",
    dayCount: 3,
    travelers: { adults: 2, children: 0 },
    budget: { min: 3000, max: 8000 },
    preferences: ["休闲度假"],
  },
  missingInfo: ["startDate", "endDate"],
  actionLog: [],
};

test("direct planning request with enough trip info continues instead of returning a question card", async () => {
  const { collectMissingInfoNode } = loadNodesModule();

  const result = await collectMissingInfoNode(completeTripState);

  assert.equal(result.responsePayload, undefined);
  assert.equal(result.missingInfo.length, 0);
});

test("complete trip info still shows a review card when user did not ask to generate", async () => {
  const { collectMissingInfoNode } = loadNodesModule();

  const result = await collectMissingInfoNode({
    ...completeTripState,
    currentMessage: "从上海出发，想去北京，计划玩3天，2个成人，预算3000-8000元，偏好休闲度假",
  });

  assert.equal(result.responsePayload?.type, "question_card");
});
