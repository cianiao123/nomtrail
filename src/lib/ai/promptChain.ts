/**
 * 4-step prompt chain for AI itinerary generation.
 * Uses DeepSeek API to:
 * 1. Parse user requirements → structured preferences
 * 2. (Optional) Enrich with POI data from AMap
 * 3. Generate daily itinerary
 * 4. Validate itinerary reasonability
 */

import { chatCompletion, streamCompletion } from "./deepseek";
import { REQUIREMENT_PARSE_PROMPT, ITINERARY_GENERATE_PROMPT, VALIDATION_PROMPT } from "./promptTemplates";
import { AIGenerateRequest } from "@/types/ai";

export interface ChainContext {
  destination: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  adults: number;
  children: number;
  budgetMin: number;
  budgetMax: number;
  preferences: string[];
  naturalLanguageInput: string;
}

function buildContext(req: AIGenerateRequest["requirements"]): ChainContext {
  const start = new Date(req.startDate);
  const end = new Date(req.endDate);
  const dayCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

  return {
    destination: req.destination,
    startDate: req.startDate,
    endDate: req.endDate,
    dayCount,
    adults: req.travelers.adults,
    children: req.travelers.children,
    budgetMin: req.budget.min,
    budgetMax: req.budget.max,
    preferences: req.preferences,
    naturalLanguageInput: req.naturalLanguageInput || "",
  };
}

/** Step 1: Parse user requirements into structured analysis */
export async function step1ParseRequirements(ctx: ChainContext): Promise<{
  destinationProfile: string;
  extractedTags: string[];
  paceRecommendation: string;
  dailyBudgetAllocation: Record<string, number>;
  specialConsiderations: string[];
}> {
  const prompt = REQUIREMENT_PARSE_PROMPT
    .replace("{destination}", ctx.destination)
    .replace("{startDate}", ctx.startDate)
    .replace("{endDate}", ctx.endDate)
    .replace("{dayCount}", String(ctx.dayCount))
    .replace("{adults}", String(ctx.adults))
    .replace("{children}", String(ctx.children))
    .replace("{budgetMin}", String(ctx.budgetMin))
    .replace("{budgetMax}", String(ctx.budgetMax))
    .replace("{preferences}", ctx.preferences.join("、"))
    .replace("{naturalLanguageInput}", ctx.naturalLanguageInput);

  const result = await chatCompletion(
    [
      { role: "system", content: "You are an expert travel planner. Output ONLY valid JSON, no markdown." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.3, responseFormat: "json_object" }
  );

  try {
    return JSON.parse(cleanJSON(result));
  } catch {
    return {
      destinationProfile: `${ctx.destination} 是一个热门旅游目的地`,
      extractedTags: [],
      paceRecommendation: "moderate",
      dailyBudgetAllocation: { accommodation: 300, food: 200, transport: 100, tickets: 150 },
      specialConsiderations: [],
    };
  }
}

/** Step 2: Generate the daily itinerary (POI injection is handled separately) */
export async function step3GenerateItinerary(
  ctx: ChainContext,
  analysis: object
): Promise<string> {
  const prompt = ITINERARY_GENERATE_PROMPT
    .replace("{dayCount}", String(ctx.dayCount))
    .replace("{analysisJSON}", JSON.stringify(analysis, null, 2))
    .replace("{scenicPOIs}", "Use your knowledge of popular attractions in " + ctx.destination)
    .replace("{restaurantPOIs}", "Use your knowledge of local cuisine in " + ctx.destination)
    .replace("{hotelPOIs}", "Use your knowledge of hotels in " + ctx.destination);

  const result = await chatCompletion(
    [
      { role: "system", content: "You are an expert travel planner. Output ONLY valid JSON with the daily itinerary structure. No markdown formatting." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.7, maxTokens: 8192, responseFormat: "json_object" }
  );

  return result;
}

/** Step 4: Validate the generated itinerary */
export async function step4Validate(
  itineraryJSON: string,
  ctx: ChainContext
): Promise<{
  warnings: { severity: string; dayIndex: number; activityIndex: number; message: string; suggestion: string }[];
  overallRisk: string;
  summary: string;
}> {
  const prompt = VALIDATION_PROMPT
    .replace("{itineraryJSON}", itineraryJSON)
    .replace("{budgetMin}", String(ctx.budgetMin))
    .replace("{budgetMax}", String(ctx.budgetMax))
    .replace("{hasChildren}", ctx.children > 0 ? "是" : "否")
    .replace("{weatherSummary}", "请根据目的地和日期判断可能的天气情况");

  const result = await chatCompletion(
    [
      { role: "system", content: "You are a travel quality reviewer. Output ONLY valid JSON, no markdown." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.3, responseFormat: "json_object" }
  );

  try {
    return JSON.parse(cleanJSON(result));
  } catch {
    return { warnings: [], overallRisk: "low", summary: "行程合理" };
  }
}

/** Full generation flow: returns { analysis, itinerary, validation } */
export async function generateFullItinerary(req: AIGenerateRequest["requirements"]) {
  const ctx = buildContext(req);

  const analysis = await step1ParseRequirements(ctx);
  // Step 2 (POI injection) is skipped for MVP - use DeepSeek's knowledge
  const itineraryRaw = await step3GenerateItinerary(ctx, analysis);
  let itinerary;
  try {
    itinerary = JSON.parse(cleanJSON(itineraryRaw));
  } catch {
    // Fallback: try to extract JSON from the response
    const match = itineraryRaw.match(/\{[\s\S]*\}/);
    itinerary = match ? JSON.parse(match[0]) : { days: [], overallTips: "", budgetSummary: {} };
  }
  const validation = await step4Validate(itineraryRaw, ctx);

  return { analysis, itinerary, validation };
}

/** Clean JSON by removing markdown code fences */
function cleanJSON(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export { buildContext };
