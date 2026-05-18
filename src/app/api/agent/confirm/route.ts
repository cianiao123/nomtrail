/**
 * POST /api/agent/confirm — Human-in-the-loop confirmation resume.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { travelAgentGraph } from "@/lib/agent/graph";
import { formatAgentNodeName } from "@/lib/agent/agents/registry";
import { SERVER_ANONYMOUS_USER_ID } from "@/lib/auth/guestUser";
import type { TravelAgentState } from "@/lib/agent/state";
import type { AgentRunSSEEvent, AgentConfirmRequest, ConfirmedPlace } from "@/types/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const AGENT_ROUTE_BUDGET_MS = (maxDuration - 8) * 1000;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const body: AgentConfirmRequest = await req.json();
  const { threadId, tripId, userId, decision } = body;

  if (!threadId || !decision) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: session } = await supabase
    .from("agent_sessions")
    .select("state_data")
    .eq("thread_id", threadId)
    .maybeSingle();

  if (!session?.state_data) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const savedState = session.state_data as TravelAgentState;
  if (tripId) savedState.tripId = tripId;
  savedState.userId = userId || savedState.userId || SERVER_ANONYMOUS_USER_ID;
  const pendingType = savedState.pendingConfirmationType;

  if (decision.confirmedPlaces?.length) {
    savedState.confirmedPlaces = decision.confirmedPlaces.map((p: ConfirmedPlace) => ({
      ...p, status: "confirmed" as const, confirmedAt: new Date().toISOString(),
    }));
  }
  if (decision.removedPlaceIds?.length) {
    savedState.confirmedPlaces = savedState.confirmedPlaces.filter(
      (p: ConfirmedPlace) => !decision.removedPlaceIds!.includes(p.id)
    );
  }
  if (pendingType === "transport" && savedState.transportPlan) {
    savedState.transportPlan = {
      ...savedState.transportPlan,
      selectedOutboundId:
        decision.transportSelection?.selectedOutboundId ??
        savedState.transportPlan.selectedOutboundId,
      selectedReturnId:
        decision.transportSelection?.selectedReturnId ??
        savedState.transportPlan.selectedReturnId,
    };
    savedState.transportConfirmed = true;
  }
  if (pendingType === "candidates") {
    const selectedNames = new Set(decision.selectedCandidateNames ?? []);
    savedState.selectedSavedPlaces = selectedNames.size
      ? (savedState.savedPlaceCandidates ?? []).filter((candidate) => selectedNames.has(candidate.name))
      : [];
    savedState.candidatePoolConfirmed = true;
  }
  savedState.needsHumanConfirmation = false;
  savedState.pendingConfirmationType = undefined;
  savedState.pendingMessage = "";
  savedState.responsePayload = undefined;
  const isEditingExistingTrip =
    !!(savedState.tripId || savedState.trip || savedState.itineraryDraft?.days?.length || (savedState.versions?.length ?? 0) > 0);
  savedState.intent = isEditingExistingTrip ? "reviseItinerary" : "generateItinerary";
  savedState.intentConfidence = 1;
  savedState.currentMessage = pendingType === "transport"
    ? "已确认交通方案，继续规划游玩时间"
    : pendingType === "candidates"
      ? "已确认候选地点，继续生成细致行程"
    : savedState.currentMessage || (isEditingExistingTrip ? "请根据确认地点修改当前行程" : "开始规划");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentRunSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      try {
        const requestStartedAt = Date.now();
        savedState.requestStartedAt = requestStartedAt;
        savedState.requestDeadlineAt = requestStartedAt + AGENT_ROUTE_BUDGET_MS;

        emit({ type: "step", node: formatAgentNodeName(pendingType === "transport" ? "plan_transport" : pendingType === "candidates" ? "extract_places" : "confirm_places"), message: "Resuming..." });
        if (pendingType !== "transport" && pendingType !== "candidates") {
          emit({
            type: "step",
            node: formatAgentNodeName("plan_transport"),
            message: "正在规划往返交通方案...",
          });
        }
        emit({
          type: "step",
          node: formatAgentNodeName(pendingType === "candidates" ? "generate_itinerary" : isEditingExistingTrip ? "revise_itinerary" : "research_inspiration"),
          message: pendingType === "candidates" ? "正在根据你选择的地点生成细致行程..." : isEditingExistingTrip ? "正在调整当前行程..." : "正在搜索种草攻略...",
        });
        const result = (await travelAgentGraph.invoke({ ...savedState }, {
          configurable: { thread_id: threadId },
        })) as TravelAgentState;

        if (result.needsHumanConfirmation) {
          const payload = {
            thread_id: result.threadId,
            user_id: result.userId || savedState.userId || SERVER_ANONYMOUS_USER_ID,
            trip_id: result.tripId || null,
            status: "awaiting_confirmation",
            state_data: result,
            updated_at: new Date().toISOString(),
          };
          const { data: existingSession, error: findError } = await supabase
            .from("agent_sessions")
            .select("id")
            .eq("thread_id", result.threadId)
            .maybeSingle();
          if (findError) throw findError;

          const { error: saveError } = existingSession
            ? await supabase
              .from("agent_sessions")
              .update(payload)
              .eq("thread_id", result.threadId)
            : await supabase
              .from("agent_sessions")
              .insert({ id: crypto.randomUUID(), ...payload });
          if (saveError) throw saveError;

          emit({
            type: "awaiting_confirmation",
            confirmationType: result.pendingConfirmationType ?? "places",
            message: result.pendingMessage ?? "请确认",
            data: {
              parsedPlaces: result.parsedPlaces,
              transportPlan: result.transportPlan,
              inspirationItems: result.inspirationItems,
              savedPlaceCandidates: result.savedPlaceCandidates,
              confirmationType: result.pendingConfirmationType,
            },
          });
          controller.close();
          return;
        }

        if (result.transportPlan) emit({ type: "chunk", data: { transportPlan: result.transportPlan } });
        if (result.savedPlaceCandidates?.length || result.inspirationItems?.length) {
          emit({
            type: "chunk",
            data: {
              inspirationItems: result.inspirationItems,
              savedPlaceCandidates: result.savedPlaceCandidates,
            },
          });
        }
        if (result.itineraryDraft) emit({ type: "chunk", data: { itineraryDraft: result.itineraryDraft } });
        if (result.critiqueResult) emit({ type: "chunk", data: { critiqueResult: result.critiqueResult } });

        if (result.assistantMessage) {
          result.conversationHistory = [
            ...(result.conversationHistory ?? []),
            { role: "agent" as const, content: result.assistantMessage },
          ];
        }
        const payload = {
          thread_id: result.threadId,
          user_id: result.userId || savedState.userId || SERVER_ANONYMOUS_USER_ID, trip_id: result.tripId || null,
          status: "completed", state_data: result, updated_at: new Date().toISOString(),
        };
        const { data: existingSession, error: findError } = await supabase
          .from("agent_sessions")
          .select("id")
          .eq("thread_id", result.threadId)
          .maybeSingle();
        if (findError) throw findError;

        const { error: saveError } = existingSession
          ? await supabase
            .from("agent_sessions")
            .update(payload)
            .eq("thread_id", result.threadId)
          : await supabase
            .from("agent_sessions")
            .insert({ id: crypto.randomUUID(), ...payload });
        if (saveError) throw saveError;

        emit({ type: "complete", intent: result.intent, message: result.assistantMessage || undefined,
          data: {
            tripId: result.tripId || null,
            intent: result.intent,
            confirmedPlaces: result.confirmedPlaces,
            transportPlan: result.transportPlan,
            inspirationItems: result.inspirationItems,
            savedPlaceCandidates: result.savedPlaceCandidates,
            itineraryDraft: result.itineraryDraft,
            critiqueResult: result.critiqueResult,
            versions: result.versions,
            errors: result.errors,
            actionLog: result.actionLog,
            currentVersionNumber: result.currentVersionNumber,
            tripCard: (result.responsePayload as Record<string, unknown>)?.type === "trip_card" ? result.responsePayload : null,
            questionCard: (result.responsePayload as Record<string, unknown>)?.type === "question_card" ? result.responsePayload : null,
            destinationRecommendationCard:
              (result.responsePayload as Record<string, unknown>)?.type === "destination_recommendation_card"
                ? result.responsePayload
                : null,
            placeGuideCard:
              (result.responsePayload as Record<string, unknown>)?.type === "place_guide_card"
                ? result.responsePayload
                : null,
            exportPayload: (result.responsePayload as Record<string, unknown>)?.content ? result.responsePayload : null,
          } });
      } catch (err) {
        emit({ type: "error", message: `Confirm failed: ${(err as Error).message}` });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
