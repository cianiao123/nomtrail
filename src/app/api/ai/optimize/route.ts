import { NextRequest } from "next/server";
import { chatCompletion } from "@/lib/ai/deepseek";
import { OPTIMIZE_PROMPT } from "@/lib/ai/promptTemplates";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tripId, instructions } = body;

  const hasApiKey = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      if (hasApiKey) {
        try {
          send({ type: "step", step: 1, label: "正在分析您的行程..." });

          // TODO: Load trip from DB and inject into prompt
          const prompt = OPTIMIZE_PROMPT
            .replace("{currentItineraryJSON}", JSON.stringify({ tripId }))
            .replace("{nearbyPOIs}", "Use your knowledge of the destination");

          const result = await chatCompletion(
            [
              { role: "system", content: "You are an expert travel optimizer. Respond in Chinese. Output JSON." },
              { role: "user", content: instructions || "请优化此行程：" + prompt },
            ],
            { temperature: 0.5, maxTokens: 2048 }
          );

          send({ type: "message", content: result });
        } catch (err) {
          send({ type: "error", message: String(err) });
        }
      } else {
        send({ type: "step", step: 1, label: "演示模式 - 正在模拟优化..." });
        await new Promise((r) => setTimeout(r, 1500));
        send({
          type: "message",
          content:
            "已根据地理距离和开放时间优化了行程安排。调整了活动的顺序，减少了约30分钟的交通时间。\n\n（演示模式 - 配置 DEEPSEEK_API_KEY 以启用真实 AI 优化）",
        });
      }

      send({ type: "complete" });
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
