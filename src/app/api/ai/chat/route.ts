import { NextRequest } from "next/server";
import { streamCompletion } from "@/lib/ai/deepseek";

const SYSTEM_PROMPT = `You are NomTrail AI, an intelligent travel assistant for a Chinese travel planning app called "NomTrail".

Your capabilities:
1. Help users plan trips - suggest destinations, itineraries, activities
2. Recommend attractions, restaurants, hotels based on preferences
3. Provide travel tips - transportation, weather, budgeting
4. Answer travel-related questions

Guidelines:
- Respond in Chinese when the user writes in Chinese
- Be concise and helpful
- For itinerary planning, ask about: destination, dates, travelers, budget, preferences
- Suggest specific, actionable advice

The app supports: AI itinerary generation, map visualization (AMap), weather integration, drag-and-drop editing.`;

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message, history } = body;

  const hasApiKey = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  if (!hasApiKey) {
    return mockChat(message);
  }

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...((history || []) as ChatHistoryItem[]).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamCompletion(messages)) {
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: 抱歉，AI 服务暂时不可用：${err}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function mockChat(message: string) {
  const encoder = new TextEncoder();
  const response =
    `你好！我是 NomTrail 的 AI 助手（演示模式）。\n\n` +
    `配置 DEEPSEEK_API_KEY 后可使用真实 AI。\n\n` +
    `你可以：\n1. 创建行程 - 告诉我目的地和时间\n2. 获取旅行建议\n3. 优化已有行程\n\n` +
    `你问的是：「${message}」`;

  const stream = new ReadableStream({
    async start(controller) {
      for (const char of response) {
        controller.enqueue(encoder.encode(`data: ${char}\n\n`));
        await sleep(20 + Math.random() * 20);
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
