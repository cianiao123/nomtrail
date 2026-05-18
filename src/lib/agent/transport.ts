import type { TransportPlan, TransportRequest, TransportOption } from "@/types/agent";

export function normalizeTransportDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${year}-${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function minutesBetween(start: string, end: string): number {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const startTotal = (startHour || 0) * 60 + (startMinute || 0);
  let endTotal = (endHour || 0) * 60 + (endMinute || 0);
  if (endTotal < startTotal) endTotal += 24 * 60;
  return endTotal - startTotal;
}

function extractBudget(message: string): number | undefined {
  const match = message.replace(/[,，]/g, "").match(/预算\s*(\d+)(?:元)?/);
  return match ? Number(match[1]) : undefined;
}

export function parseTransportRequest(message: string): TransportRequest | null {
  const compact = message.replace(/\s+/g, "");
  const cityMatch = compact.match(/从([^到去出发]{1,12})(?:到|去)([^，,。；;\s预算]{1,12})/);
  if (!cityMatch) return null;

  const dates = [...compact.matchAll(/(\d{4}-\d{1,2}-\d{1,2})/g)].map((match) =>
    normalizeTransportDate(match[1])
  );
  const origin = cityMatch[1]?.trim();
  const destination = cityMatch[2]?.trim();
  if (!origin || !destination) return null;

  return {
    origin,
    destination,
    departDate: dates[0] ?? "",
    returnDate: dates[1],
    budget: extractBudget(compact),
  };
}

function makeOption(
  id: string,
  fromName: string,
  toName: string,
  departTime: string,
  arriveTime: string,
  price: number,
  notes: string
): TransportOption {
  return {
    id,
    mode: "train",
    fromName,
    toName,
    departTime,
    arriveTime,
    durationMinutes: minutesBetween(departTime, arriveTime),
    price,
    provider: "mock",
    confidence: "estimated",
    notes,
  };
}

export function buildMockTransportPlan(request: TransportRequest): TransportPlan {
  const originStation = request.origin.endsWith("京") ? `${request.origin}西` : request.origin;
  const destinationStation = request.destination === "武汉" ? "汉口" : request.destination;
  const returnOriginStation = request.destination === "武汉" ? "武昌" : request.destination;
  const returnDestinationStation = request.origin.endsWith("京") ? `${request.origin}西` : request.origin;

  return {
    origin: request.origin,
    destination: request.destination,
    departDate: request.departDate,
    returnDate: request.returnDate,
    budget: request.budget,
    outboundOptions: [
      makeOption("outbound-1", originStation, destinationStation, "06:20", "12:31", 521, "早出发，中午抵达，适合下午开始轻量游玩。"),
      makeOption("outbound-2", request.origin, request.destination, "06:50", "13:08", 523, "抵达时间适中，给酒店入住和晚间活动留出空间。"),
      makeOption("outbound-3", originStation, request.destination, "07:05", "11:13", 623, "耗时较短，适合想保留第一天下午完整时间的行程。"),
    ],
    returnOptions: request.returnDate
      ? [
          makeOption("return-1", returnOriginStation, returnDestinationStation, "02:58", "13:45", 201, "价格较低，但出发时间偏早，适合作为预算优先方案。"),
          makeOption("return-2", returnOriginStation, returnDestinationStation, "01:02", "12:03", 261.5, "凌晨出发，牺牲休息换取更早返程。"),
          makeOption("return-3", returnOriginStation, returnDestinationStation, "05:01", "15:55", 261.5, "时间相对均衡，适合不想太晚抵达的返程。"),
        ]
      : [],
    selectedOutboundId: "outbound-1",
    selectedReturnId: request.returnDate ? "return-3" : undefined,
    disclaimer: "第一阶段为示例交通方案，价格和余票以实际购票平台为准。",
    fallbackPrompt: "如果您已经购买好了出行车票，请告诉我车次/航班、出发到达时间和站点信息，我来帮您继续规划。",
  };
}

export function createTransportPlanFromMessage(message: string): TransportPlan | null {
  const request = parseTransportRequest(message);
  if (!request || !request.departDate) return null;
  return buildMockTransportPlan(request);
}

export function createTransportPlanFromMessages(
  messages: string[],
  fallbackDepartDate: string
): TransportPlan | null {
  const combined = messages.filter(Boolean).join("，");
  const request = parseTransportRequest(combined);
  if (!request) return null;

  return buildMockTransportPlan({
    ...request,
    departDate: request.departDate || fallbackDepartDate,
  });
}

export function createTransportPlanFromRequirements(requirements: {
  origin?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  dayCount?: number | null;
  budget?: { min?: number | null; max?: number | null } | null;
}): TransportPlan | null {
  if (!requirements.origin || !requirements.destination || (!requirements.startDate && !requirements.dayCount)) {
    return null;
  }
  const departDate = requirements.startDate ?? new Date().toISOString().slice(0, 10);
  const returnDate = requirements.endDate ??
    (requirements.dayCount && requirements.dayCount > 1
      ? new Date(new Date(departDate).getTime() + (requirements.dayCount - 1) * 86400000)
          .toISOString()
          .slice(0, 10)
      : undefined);

  return buildMockTransportPlan({
    origin: requirements.origin,
    destination: requirements.destination,
    departDate,
    returnDate,
    budget: typeof requirements.budget?.max === "number" ? requirements.budget.max : undefined,
  });
}
