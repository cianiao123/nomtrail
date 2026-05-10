import { create } from 'zustand';
import { ChatMessage } from '@/types/ai';

interface AIChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;

  addMessage: (msg: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamContent: (chunk: string) => void;
  finalizeStreamMessage: () => void;
  clearMessages: () => void;
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  appendStreamContent: (chunk) =>
    set((s) => ({ streamingContent: s.streamingContent + chunk })),
  finalizeStreamMessage: () => {
    const content = get().streamingContent;
    if (!content.trim()) return;
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
        },
      ],
      streamingContent: '',
      isStreaming: false,
    }));
  },
  clearMessages: () => set({ messages: [], streamingContent: '', isStreaming: false }),
}));
