/**
 * DeepSeek API client for AI-powered travel planning.
 * Uses DeepSeek Chat API: https://api.deepseek.com/v1/chat/completions
 *
 * Requires DEEPSEEK_API_KEY in .env.local
 */

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-chat";

interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DeepSeekResponse {
  id: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }[];
}

interface DeepSeekStreamChunk {
  id: string;
  choices: {
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }[];
}

function getApiKey(): string {
  // Try DeepSeek-specific key first, then Anthropic-compatible key
  return (
    process.env.DEEPSEEK_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    ""
  );
}

function getBaseUrl(): string {
  // Support custom base URL for proxies
  return process.env.DEEPSEEK_BASE_URL || DEEPSEEK_BASE;
}

/** Non-streaming chat completion */
export async function chatCompletion(
  messages: DeepSeekMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "text" | "json_object";
    signal?: AbortSignal;
  }
): Promise<string> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: options?.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      response_format:
        options?.responseFormat === "json_object"
          ? { type: "json_object" }
          : undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }

  const data: DeepSeekResponse = await res.json();
    return data.choices[0]?.message?.content ?? "";
}

/** Streaming chat completion - yields content chunks */
export async function* streamCompletion(
  messages: DeepSeekMessage[],
  options?: { temperature?: number; maxTokens?: number }
): AsyncGenerator<string> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === "[DONE]") return;

      try {
        const chunk: DeepSeekStreamChunk = JSON.parse(jsonStr);
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // Skip unparseable chunks
      }
    }
  }
}
