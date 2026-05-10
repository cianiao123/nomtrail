import { NextRequest } from "next/server";
import { generateFullItinerary } from "@/lib/ai/promptChain";
import { AIGenerateRequest } from "@/types/ai";

export async function POST(req: NextRequest) {
  const body: AIGenerateRequest = await req.json();
  const { requirements } = body;

  const hasApiKey = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  if (!hasApiKey) {
    // Fall back to mock data
    return mockGenerate(body);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Step 1: Parse requirements
        send({ type: "step", step: 1, label: "正在分析您的需求...", stepType: "parse" });

        // Step 2: POI search (skip for now)
        send({ type: "step", step: 2, label: "正在搜索目的地信息...", stepType: "poi_search" });

        // Step 3: Generate itinerary via DeepSeek
        send({ type: "step", step: 3, label: "AI 正在生成行程...", stepType: "generate" });

        const result = await generateFullItinerary(requirements);

        if (result.itinerary?.days) {
          const days = result.itinerary.days.map((day: any, i: number) => ({
            id: crypto.randomUUID(),
            tripId: body.tripId || "generated",
            dayIndex: i,
            date: new Date(
              new Date(requirements.startDate).getTime() + i * 86400000
            )
              .toISOString()
              .split("T")[0],
            activities: (day.activities || []).map((a: any, j: number) => ({
              id: crypto.randomUUID(),
              dayId: `day-${i}`,
              order: (j + 1) * 1000,
              type: a.type || "attraction",
              poi: a.poi || null,
              customName: a.name || a.customName || `活动${j + 1}`,
              startTime: a.startTime || "09:00",
              endTime: a.endTime || "11:00",
              durationMinutes: a.durationMinutes || 120,
              notes: a.notes || "",
              estimatedCost: a.estimatedCost || 0,
              isGenerated: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })),
            notes: day.theme || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));

          for (const day of days) {
            send({ type: "day_chunk", dayIndex: day.dayIndex, activities: day.activities });
          }
        }

        // Step 4: Validate
        send({ type: "step", step: 4, label: "正在校验行程合理性...", stepType: "validate" });

        if (result.validation?.warnings) {
          for (const w of result.validation.warnings) {
            send({ type: "warning", warning: w });
          }
        }

        send({
          type: "complete",
          trip: { id: body.tripId || crypto.randomUUID(), days: [] },
        });
      } catch (err) {
        send({ type: "error", message: `AI 生成失败: ${err}` });
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

/** Mock fallback when no API key */
function mockGenerate(body: AIGenerateRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ type: "step", step: 1, label: "正在分析您的需求...", stepType: "parse" });
      await sleep(600);
      send({ type: "step", step: 2, label: "正在搜索目的地信息...", stepType: "poi_search" });
      await sleep(800);
      send({ type: "step", step: 3, label: "演示模式 - 正在生成行程...", stepType: "generate" });

      const { requirements } = body;
      const start = new Date(requirements.startDate);
      const end = new Date(requirements.endDate);
      const dayCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

      const mockActivities = [
        { type: "attraction", name: "热门景点", time: "09:00 - 11:30", cost: 80 },
        { type: "food", name: "当地美食", time: "12:00 - 13:00", cost: 60 },
        { type: "attraction", name: "文化体验", time: "14:00 - 16:00", cost: 50 },
      ];

      for (let i = 0; i < dayCount; i++) {
        const activities = mockActivities.map((a, j) => ({
          id: crypto.randomUUID(),
          dayId: `day-${i}`,
          order: (j + 1) * 1000,
          type: a.type,
          poi: null,
          customName: `${a.name}`,
          startTime: a.time.split(" - ")[0],
          endTime: a.time.split(" - ")[1],
          durationMinutes: 150,
          estimatedCost: a.cost,
          isGenerated: true,
          notes: "演示模式 - 请配置 DEEPSEEK_API_KEY 以启用真实 AI 生成",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        send({ type: "day_chunk", dayIndex: i, activities });
        await sleep(400);
      }

      send({ type: "step", step: 4, label: "正在校验行程...", stepType: "validate" });
      await sleep(400);
      send({ type: "complete", trip: { id: body.tripId || crypto.randomUUID(), days: [] } });
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
