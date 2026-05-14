/**
 * POST /api/agent/run — LangGraph-powered travel planning agent.
 * Request: { threadId, message, tripId?, userId? }
 * Response: SSE stream
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { travelAgentGraph } from "@/lib/agent/graph";
import { createInitialAgentState } from "@/lib/agent/sessionContext";
import { formatAgentNodeName } from "@/lib/agent/agents/registry";
import { SERVER_ANONYMOUS_USER_ID } from "@/lib/auth/guestUser";
import type { TravelAgentState } from "@/lib/agent/state";
import type { AgentRunRequest, AgentRunSSEEvent } from "@/types/agent";

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
      user_id: state.userId || SERVER_ANONYMOUS_USER_ID,
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

      let progressTimer: ReturnType<typeof setInterval> | null = null;

      try {
        // Load previous session for multi-turn memory
        const prevState = await loadSession(threadId);
        const requestStartedAt = Date.now();
        const requestDeadlineAt = requestStartedAt + AGENT_ROUTE_BUDGET_MS;

        const initialState: Partial<TravelAgentState> = createInitialAgentState({
          threadId,
          tripId: tripId ?? prevState?.tripId ?? "",
          userId,
          message,
          prevState,
          requestStartedAt,
          requestDeadlineAt,
        });

        const progressEvents: Array<{ node: string; message: string }> = [
          { node: formatAgentNodeName("load_context"), message: "正在读取你的旅行需求" },
          { node: formatAgentNodeName("parse_trip"), message: "正在确认目的地、天数、人数和预算" },
          { node: formatAgentNodeName("research_inspiration"), message: "正在搜索攻略与种草内容" },
          { node: formatAgentNodeName("extract_places"), message: "正在把攻略整理成候选地点池" },
          { node: formatAgentNodeName("critique_itinerary"), message: "正在按预算区间校准活动费用" },
          { node: formatAgentNodeName("generate_itinerary"), message: "正在生成每日行程安排" },
        ];
        let progressIndex = 0;
        emit({ type: "step", ...progressEvents[progressIndex] });
        progressTimer = setInterval(() => {
          progressIndex = Math.min(progressIndex + 1, progressEvents.length - 1);
          emit({ type: "step", ...progressEvents[progressIndex] });
        }, 3500);

        const result = (await travelAgentGraph.invoke(initialState, {
          configurable: { thread_id: threadId },
        })) as TravelAgentState;
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }

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
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
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
