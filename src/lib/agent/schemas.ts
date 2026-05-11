/**
 * Zod schemas for validating Agent LLM outputs.
 * Every LLM node's response is validated against these schemas.
 */

import { z } from "zod";

// === Intent Classification ===
export const IntentResultSchema = z.object({
  intent: z.enum([
    "parseTrip",
    "parsePlaces",
    "recommendDestinations",
    "generateItinerary",
    "critiqueItinerary",
    "reviseItinerary",
    "exportItinerary",
    "generalChat",
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

// === Parsed Place ===
export const ParsedPlaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "地点名不能为空"),
  address: z.string().optional(),
  category: z.enum(["attraction", "food", "hotel", "transport", "other"]),
  notes: z.string().optional(),
  estimatedDuration: z.number().min(0).optional(),
  estimatedCost: z.number().min(0).optional(),
  priority: z.enum(["must_go", "want_to_go", "optional"]),
  sourceText: z.string(),
});

export const ParsePlacesResultSchema = z.object({
  places: z.array(ParsedPlaceSchema),
});

// === Trip Requirements Parsing ===
export const ParseTripResultSchema = z.object({
  destination: z.string().min(1).nullable(),
  destinationCoord: z
    .object({ lat: z.number(), lng: z.number() })
    .nullable()
    .optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  dayCount: z.number().min(1).max(30).nullable().optional(),
  travelers: z
    .object({ adults: z.number().min(1), children: z.number().min(0) })
    .nullable()
    .optional(),
  budget: z
    .object({
      min: z.number().nullable().optional(),
      max: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  preferences: z.array(z.string()).nullable().optional(),
  missingInfo: z.array(z.string()),
});

// === Itinerary Generation ===
export const ActivityDraftSchema = z.object({
  order: z.number(),
  type: z.enum(["attraction", "food", "restaurant", "hotel", "transport", "other"]),
  name: z.string().min(1),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  durationMinutes: z.number().min(0).optional(),
  estimatedCost: z.number().min(0).optional(),
  notes: z.string().optional(),
  sourceReason: z.string().optional(),
  bookingRequired: z.boolean().optional(),
  openingHours: z.string().optional(),
  recommendedDuration: z.number().min(0).optional(),
  weatherFit: z.string().optional(),
  ticketReference: z.string().nullable().optional(),
  travelMinutesFromPrev: z.number().min(0).optional(),
});

export const DayDraftSchema = z.object({
  dayIndex: z.number(),
  date: z.string(),
  theme: z.string().optional(),
  activities: z.array(ActivityDraftSchema),
  notes: z.string().optional(),
});

export const GenerateItineraryResultSchema = z.object({
  days: z.array(DayDraftSchema),
  overallTips: z.string().optional(),
  budgetSummary: z.record(z.string(), z.number()).optional(),
});

// === Critique ===
export const CritiqueIssueSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  dayIndex: z.number(),
  activityIndex: z.number().nullable().optional(),
  category: z.enum([
    "overpacked",
    "geo",
    "geography",
    "timing",
    "weather",
    "budget",
    "booking",
    "child_unfriendly",
    "other",
    "rest",
    "logistics",
    "feasibility",
  ]),
  message: z.string(),
  suggestion: z.string(),
});

export const CritiqueResultSchema = z.object({
  overallScore: z.number().min(1).max(10),
  paceScore: z.number().min(1).max(10).optional(),
  geoScore: z.number().min(1).max(10).optional(),
  feasibilityScore: z.number().min(1).max(10).optional(),
  issues: z.array(CritiqueIssueSchema),
  summary: z.string(),
});

export const InspirationItemSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sourceType: z.enum(["xhs", "web", "poi"]),
  sourceUrl: z.string(),
  author: z.string().optional(),
  city: z.string(),
  mentionedPlaces: z.array(z.string()),
  tags: z.array(z.string()),
  qualityScore: z.number().min(0).max(1),
});

export const SavedPlaceCandidateSchema = z.object({
  name: z.string().min(1),
  city: z.string(),
  category: z.enum(["attraction", "food", "hotel", "transport", "other"]),
  priorityTag: z.enum(["must_go", "nearby_optional", "rainy_backup", "night_option", "food_candidate"]),
  reason: z.string(),
  sourceRefs: z.array(z.string()),
  coordinate: z.object({ lat: z.number(), lng: z.number() }).optional(),
  address: z.string().optional(),
  openingHours: z.string().optional(),
  ticketReference: z.string().nullable().optional(),
  recommendedDuration: z.number().min(0).optional(),
  qualityScore: z.number().min(0).max(1),
});

export const TravelInspirationResultSchema = z.object({
  inspirationItems: z.array(InspirationItemSchema),
  savedPlaceCandidates: z.array(SavedPlaceCandidateSchema),
});

export const DestinationRecommendationSchema = z.object({
  city: z.string().min(1),
  highlight: z.string().min(1),
  reason: z.string().min(1),
});

export const RecommendDestinationsResultSchema = z.object({
  title: z.string().min(1),
  intro: z.string().min(1),
  recommendations: z.array(DestinationRecommendationSchema).min(3).max(5),
});

// === Revision ===
export const ReviseItineraryResultSchema = z.object({
  days: z.array(DayDraftSchema),
  changeDescription: z.string(),
  overallTips: z.string().optional(),
});

// === Missing Info Response ===
export const MissingInfoResponseSchema = z.object({
  questions: z.array(
    z.object({
      field: z.string(),
      question: z.string(),
      example: z.string().optional(),
    })
  ),
});

// === Normalize Activities ===
export const NormalizeActivitiesResultSchema = z.object({
  activities: z.array(
    z.object({
      id: z.string(),
      tripId: z.string(),
      dayIndex: z.number(),
      date: z.string(),
      order: z.number(),
      type: z.enum(["attraction", "food", "hotel", "transport", "other"]),
      name: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      durationMinutes: z.number(),
      estimatedCost: z.number(),
      notes: z.string(),
      source: z.string(),
    })
  ),
});

// === Export ===
export const ExportResultSchema = z.object({
  title: z.string(),
  format: z.enum(["friend_summary", "detailed_plan", "checklist", "markdown"]),
  content: z.string(),
});

/**
 * Validate and return parsed result, with retry handling.
 * Returns the parsed result, or throws if validation fails.
 */
export function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Schema validation failed for ${context}:\n${issues}\nReceived: ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  return result.data;
}
