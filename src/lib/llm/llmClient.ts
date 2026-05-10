// === LLM Adapter Interface ===

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMGenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMJsonOptions extends LLMGenerateOptions {
  schemaName?: string;
}

export interface LLMToolDefinition {
  type: string;
  name: string;
  description?: string;
  max_uses?: number;
}

export interface LLMClient {
  /** Generate structured JSON output from messages */
  generateJson<T>(messages: LLMMessage[], options?: LLMJsonOptions): Promise<T>;

  /** Generate free-form text from messages */
  generateText(messages: LLMMessage[], options?: LLMGenerateOptions): Promise<string>;

  /** Generate with tool use (e.g. web search) */
  generateWithTools?(
    messages: LLMMessage[],
    tools: LLMToolDefinition[],
    options?: LLMGenerateOptions
  ): Promise<{ content: string; toolCalls?: unknown[] }>;
}
