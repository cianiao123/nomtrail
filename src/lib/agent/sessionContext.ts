import type { TravelAgentState } from "./state";

const SERVER_ANONYMOUS_USER_ID = "anonymous-server-user";

interface CreateInitialAgentStateInput {
  threadId: string;
  message: string;
  tripId?: string;
  userId?: string;
  prevState?: TravelAgentState | null;
  requestStartedAt: number;
  requestDeadlineAt: number;
}

export function createInitialAgentState({
  threadId,
  message,
  tripId,
  userId,
  prevState,
  requestStartedAt,
  requestDeadlineAt,
}: CreateInitialAgentStateInput): Partial<TravelAgentState> {
  const nextTripId = tripId ?? prevState?.tripId ?? "";
  const isSameTripSession = !!prevState && (!tripId || prevState.tripId === tripId);
  const prevHistory = isSameTripSession ? prevState?.conversationHistory ?? [] : [];

  return {
    threadId,
    userId: userId || prevState?.userId || SERVER_ANONYMOUS_USER_ID,
    requestStartedAt,
    requestDeadlineAt,
    tripId: nextTripId,
    currentMessage: message,
    conversationHistory: [
      ...prevHistory,
      { role: "user" as const, content: message },
    ],
    parsedTripRequirements: isSameTripSession ? prevState?.parsedTripRequirements ?? null : null,
    missingInfo: isSameTripSession ? prevState?.missingInfo ?? [] : [],
    parsedPlaces: isSameTripSession ? prevState?.parsedPlaces ?? [] : [],
    confirmedPlaces: isSameTripSession ? prevState?.confirmedPlaces ?? [] : [],
    inspirationItems: isSameTripSession ? prevState?.inspirationItems ?? [] : [],
    savedPlaceCandidates: isSameTripSession ? prevState?.savedPlaceCandidates ?? [] : [],
    selectedSavedPlaces: isSameTripSession ? prevState?.selectedSavedPlaces ?? [] : [],
    candidatePoolConfirmed: isSameTripSession ? prevState?.candidatePoolConfirmed ?? false : false,
    transportPlan: isSameTripSession ? prevState?.transportPlan ?? null : null,
    transportConfirmed: isSameTripSession ? prevState?.transportConfirmed ?? false : false,
    itineraryDraft: isSameTripSession ? prevState?.itineraryDraft ?? null : null,
    versions: isSameTripSession ? prevState?.versions ?? [] : [],
    currentVersionNumber: isSameTripSession ? prevState?.currentVersionNumber ?? 0 : 0,
    critiqueResult: isSameTripSession ? prevState?.critiqueResult ?? null : null,
    needsHumanConfirmation: false,
    errors: [],
    actionLog: [],
  };
}
