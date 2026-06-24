import { createClient } from "@supabase/supabase-js";
import { SERVER_ANONYMOUS_USER_ID } from "@/lib/auth/guestUser";
import type { TravelAgentState } from "./state";

type AgentSessionStatus = "running" | "awaiting_confirmation" | "completed" | "error";

type SaveAgentSessionResult = {
  persisted: boolean;
  error?: string;
};

type AgentSessionFallbackGlobal = typeof globalThis & {
  __travelAgentSessionFallback?: Map<string, TravelAgentState>;
};

function getFallbackSessions() {
  const sharedGlobal = globalThis as AgentSessionFallbackGlobal;
  if (!sharedGlobal.__travelAgentSessionFallback) {
    sharedGlobal.__travelAgentSessionFallback = new Map<string, TravelAgentState>();
  }
  return sharedGlobal.__travelAgentSessionFallback;
}

function cloneState(state: TravelAgentState): TravelAgentState {
  return JSON.parse(JSON.stringify(state)) as TravelAgentState;
}

function formatSessionError(err: unknown) {
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message?: unknown }).message);
    const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
    return code ? `${message} (${code})` : message;
  }
  return String(err);
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase session store configuration");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function loadAgentSession(threadId: string): Promise<TravelAgentState | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("agent_sessions")
      .select("state_data")
      .eq("thread_id", threadId)
      .maybeSingle();
    if (error) throw error;
    if (data?.state_data) return data.state_data as TravelAgentState;
  } catch {
    // Fall through to process-local storage. The API routes can still resume
    // confirmations on single-process deployments when remote persistence fails.
  }

  const fallbackState = getFallbackSessions().get(threadId);
  return fallbackState ? cloneState(fallbackState) : null;
}

export async function saveAgentSession(
  state: TravelAgentState,
  status: AgentSessionStatus
): Promise<SaveAgentSessionResult> {
  let persisted = false;
  let errorMessage = "";

  try {
    const supabase = getSupabase();
    const payload = {
      thread_id: state.threadId,
      user_id: state.userId || SERVER_ANONYMOUS_USER_ID,
      trip_id: state.tripId || null,
      status,
      state_data: cloneState(state),
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
    if (error) throw error;
    persisted = true;
  } catch (err) {
    errorMessage = formatSessionError(err);
    (state as TravelAgentState & { _saveError?: string })._saveError = errorMessage;
  }

  getFallbackSessions().set(state.threadId, cloneState(state));
  return errorMessage ? { persisted, error: errorMessage } : { persisted };
}
