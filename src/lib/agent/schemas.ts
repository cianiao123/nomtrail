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
  origin: z.string().min(1).nullable().optional(),
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
const ActivityTypeSchema = z.preprocess((value) => {
  const normalized = String(value || "").toLowerCase().trim();
  if (["meal", "dining", "restaurant", "cafe", "coffee", "snack"].includes(normalized)) {
    return "food";
  }
  if (["sightseeing", "scenic", "spot", "poi"].includes(normalized)) {
    return "attraction";
  }
  if (["transfer", "transit", "traffic"].includes(normalized)) {
    return "transport";
  }
  return normalized;
}, z.enum(["attraction", "food", "restaurant", "hotel", "transport", "other"]));

const OptionalStringSchema: z.ZodType<string | undefined, z.ZodTypeDef, string | null | undefined> = z.string()
  .optional()
  .nullable()
  .transform((value) => value ?? undefined);
const OptionalNonNegativeNumberSchema: z.ZodType<number | undefined, z.ZodTypeDef, number | null | undefined> = z.number()
  .min(0)
  .optional()
  .nullable()
  .transform((value) => value ?? undefined);
const OptionalBooleanSchema: z.ZodType<boolean | undefined, z.ZodTypeDef, boolean | null | undefined> = z.boolean()
  .optional()
  .nullable()
  .transform((value) => value ?? undefined);

export const ActivityDraftSchema = z.object({
  order: z.number(),
  type: ActivityTypeSchema,
  name: z.string().min(1),
  startTime: OptionalStringSchema,
  endTime: OptionalStringSchema,
  durationMinutes: OptionalNonNegativeNumberSchema,
  estimatedCost: OptionalNonNegativeNumberSchema,
  notes: OptionalStringSchema,
  sourceReason: OptionalStringSchema,
  bookingRequired: OptionalBooleanSchema,
  openingHours: OptionalStringSchema,
  recommendedDuration: OptionalNonNegativeNumberSchema,
  weatherFit: OptionalStringSchema,
  ticketReference: z.string().nullable().optional(),
  travelMinutesFromPrev: OptionalNonNegativeNumberSchema,
});

export const DayDraftSchema = z.object({
  dayIndex: z.number(),
  date: z.string(),
  theme: OptionalStringSchema,
  activities: z.array(ActivityDraftSchema),
  notes: OptionalStringSchema,
});

export const GenerateItineraryResultSchema = z.object({
  days: z.array(DayDraftSchema),
  overallTips: OptionalStringSchema,
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

export const PlaceGuideResultSchema = z.object({
  placeName: z.string().min(1),
  title: z.string().min(1),
  intro: z.string().min(1),
  bestTime: z.string().optional(),
  tips: z.array(z.string()).min(2).max(5),
  spots: z.array(z.object({
    name: z.string().min(1),
    imageKeyword: z.string().min(1),
    highlight: z.string().min(1),
    description: z.string().min(1),
    duration: z.string().min(1),
    suitableFor: z.string().min(1),
  })).min(3).max(6),
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
export function validateWithSchema<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  context: string
): z.output<T> {
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
