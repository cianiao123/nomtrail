/**
 * DeepSeek LLM Adapter — implements the LLMClient interface.
 * Wraps the existing deepseek.ts client without modifying it.
 */

import { chatCompletion } from "@/lib/ai/deepseek";
import {
  LLMClient,
  LLMMessage,
  LLMGenerateOptions,
  LLMJsonOptions,
  LLMToolDefinition,
} from "./llmClient";

const DEEPSEEK_ANTHROPIC_BASE = "https://api.deepseek.com/anthropic/v1";

function getApiKey(): string {
  return (
    process.env.DEEPSEEK_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    ""
  );
}

/** Clean JSON - remove markdown code fences */
function cleanJSON(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export const deepseekClient: LLMClient = {
  /** Generate structured JSON using the existing chatCompletion with json_object format */
  async generateJson<T>(
    messages: LLMMessage[],
    options?: LLMJsonOptions
  ): Promise<T> {
    const result = await chatCompletion(messages, {
      temperature: options?.temperature ?? 0.2,
      maxTokens: options?.maxTokens ?? 4096,
      responseFormat: "json_object",
    });

    try {
      return JSON.parse(cleanJSON(result)) as T;
    } catch (e) {
      // Try extracting JSON from the response
      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]) as T;
      }
      throw new Error(
        `DeepSeek JSON parse error: ${(e as Error).message}. Raw: ${result.slice(0, 200)}`
      );
    }
  },

  /** Generate free-form text */
  async generateText(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<string> {
    return chatCompletion(messages, {
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 4096,
    });
  },

  /** Generate with tool use (web search) via Anthropic-compatible endpoint */
  async generateWithTools(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    options?: LLMGenerateOptions
  ): Promise<{ content: string; toolCalls?: unknown[] }> {
    const apiKey = getApiKey();

    const res = await fetch(`${DEEPSEEK_ANTHROPIC_BASE}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.3,
        tools,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `DeepSeek Anthropic API error ${res.status}: ${err}`
      );
    }

    const data = await res.json();
    const content =
      data.content?.[0]?.type === "text"
        ? data.content[0].text
        : "";

    return {
      content,
      toolCalls: data.content?.filter(
        (c: { type: string }) => c.type !== "text"
      ),
    };
  },
};
