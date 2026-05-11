/**
 * POST /api/agent/run — LangGraph-powered travel planning agent.
 * Request: { threadId, message, tripId?, userId? }
 * Response: SSE stream
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { travelAgentGraph } from "@/lib/agent/graph";
import type { TravelAgentState } from "@/lib/agent/state";
import type { AgentRunRequest, AgentRunSSEEvent } from "@/types/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

async function loadSession(threadId: string): Promise<TravelAgentState | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("agent_sessions")
    .select("state_data")
    .eq("thread_id", threadId)
    .maybeSingle();
  return (data?.state_data as TravelAgentState) ?? null;
}

async function saveSession(state: TravelAgentState, status: string) {
  try {
    const supabase = getSupabase();
    const payload = {
      thread_id: state.threadId,
      user_id: state.userId || "local-user",
      trip_id: state.tripId || null,
      status,
      state_data: JSON.parse(JSON.stringify(state)), // ensure serializable
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: findError } = await supabase
      .from("agent_sessions")
      .select("id")
      .eq("thread_id", state.threadId)
      .maybeSingle();
    if (findError) throw findError;

    const { error } = existing
      ? await supabase
        .from("agent_sessions")
        .update(payload)
        .eq("thread_id", state.threadId)
      : await supabase
        .from("agent_sessions")
        .insert({ id: crypto.randomUUID(), ...payload });
    if (error) {
      // Surface save error in the debug output
      (state as Record<string, unknown>)._saveError = JSON.stringify(error);
    }
  } catch (err) {
    (state as Record<string, unknown>)._saveError = String(err);
  }
}

export async function POST(req: NextRequest) {
  const body: AgentRunRequest = await req.json();
  const { threadId, message, tripId, userId } = body;

  if (!threadId || !message) {
    return Response.json(
      { error: "Missing required fields: threadId, message" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AgentRunSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Load previous session for multi-turn memory
        const prevState = await loadSession(threadId);
        const prevHistory = prevState?.conversationHistory ?? [];
        const conversationHistory = [
          ...prevHistory,
          { role: "user" as const, content: message },
        ];

        const initialState: Partial<TravelAgentState> = {
          threadId,
          userId: userId || prevState?.userId || "local-user",
          tripId: tripId ?? prevState?.tripId ?? "",
          currentMessage: message,
          conversationHistory,
          parsedTripRequirements: prevState?.parsedTripRequirements ?? null,
          missingInfo: prevState?.missingInfo ?? [],
          parsedPlaces: prevState?.parsedPlaces ?? [],
          confirmedPlaces: prevState?.confirmedPlaces ?? [],
          inspirationItems: prevState?.inspirationItems ?? [],
          savedPlaceCandidates: prevState?.savedPlaceCandidates ?? [],
          selectedSavedPlaces: prevState?.selectedSavedPlaces ?? [],
          itineraryDraft: prevState?.itineraryDraft ?? null,
          versions: prevState?.versions ?? [],
          currentVersionNumber: prevState?.currentVersionNumber ?? 0,
          critiqueResult: prevState?.critiqueResult ?? null,
          needsHumanConfirmation: false,
          errors: [],
          actionLog: [],
        };

        emit({ type: "step", node: "START", message: "Agent started" });
        if (/想去|计划|安排|规划|生成|开始/.test(message)) {
          emit({ type: "step", node: "research_inspiration", message: "正在搜索种草攻略..." });
        }

        const result = (await travelAgentGraph.invoke(initialState, {
          configurable: { thread_id: threadId },
        })) as TravelAgentState;

        // Human-in-the-loop checkpoint
        if (result.needsHumanConfirmation) {
          await saveSession(result, "awaiting_confirmation");
          emit({
            type: "awaiting_confirmation",
            confirmationType: result.pendingConfirmationType ?? "places",
            message: result.pendingMessage ?? "请确认",
            data: {
              parsedPlaces: result.parsedPlaces,
              confirmationType: result.pendingConfirmationType,
            },
          });
          controller.close();
          return;
        }

        // Emit intermediate results
        if ((result.responsePayload as Record<string,unknown>)?.type === "question_card") {
          emit({ type: "chunk", data: { questionCard: result.responsePayload } });
        }
        if ((result.responsePayload as Record<string,unknown>)?.type === "destination_recommendation_card") {
          emit({ type: "chunk", data: { destinationRecommendationCard: result.responsePayload } });
        }
        if (result.parsedPlaces?.length) {
          emit({ type: "chunk", data: { parsedPlaces: result.parsedPlaces }, message: `Parsed ${result.parsedPlaces.length} places` });
        }
        if (result.savedPlaceCandidates?.length || result.inspirationItems?.length) {
          emit({
            type: "chunk",
            data: {
              inspirationItems: result.inspirationItems,
              savedPlaceCandidates: result.savedPlaceCandidates,
            },
            message: "正在提炼地点",
          });
        }
        if (result.itineraryDraft) {
          emit({ type: "chunk", data: { itineraryDraft: result.itineraryDraft }, message: "Itinerary generated" });
        }
        if (result.critiqueResult) {
          emit({ type: "chunk", data: { critiqueResult: result.critiqueResult }, message: `Scored ${result.critiqueResult.overallScore}/10` });
        }

        // Complete — append agent response to history
        if (result.assistantMessage) {
          result.conversationHistory = [
            ...(result.conversationHistory ?? []),
            { role: "agent" as const, content: result.assistantMessage },
          ];
        }
        await saveSession(result, "completed");

        emit({
          type: "complete",
          intent: result.intent,
          message: result.assistantMessage || undefined,
          data: {
            tripId: result.tripId || null,
            intent: result.intent,
            parsedPlaces: result.parsedPlaces,
            confirmedPlaces: result.confirmedPlaces,
            inspirationItems: result.inspirationItems,
            savedPlaceCandidates: result.savedPlaceCandidates,
            itineraryDraft: result.itineraryDraft,
            critiqueResult: result.critiqueResult,
            versions: result.versions,
            errors: result.errors,
            actionLog: result.actionLog,
            currentVersionNumber: result.currentVersionNumber,
            tripCard: (result.responsePayload as Record<string,unknown>)?.type === "trip_card" ? result.responsePayload : null,
            questionCard: (result.responsePayload as Record<string,unknown>)?.type === "question_card" ? result.responsePayload : null,
            destinationRecommendationCard:
              (result.responsePayload as Record<string,unknown>)?.type === "destination_recommendation_card"
                ? result.responsePayload
                : null,
            exportPayload: (result.responsePayload as Record<string,unknown>)?.content ? result.responsePayload : null,
          },
        });
      } catch (err) {
        emit({
          type: "error",
          message: `Agent execution failed: ${(err as Error).message}`,
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
