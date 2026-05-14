export type ResearchVerticalId = "scenic" | "food" | "stay";

export interface ResearchVerticalAgent {
  id: ResearchVerticalId;
  nodeName: "scenic_research" | "food_research" | "stay_research";
  title: string;
  focus: string;
}

export const RESEARCH_VERTICALS: ResearchVerticalAgent[] = [
  {
    id: "scenic",
    nodeName: "scenic_research",
    title: "景点研究",
    focus: "景点 博物馆 公园 街区 夜景 小众打卡 开放时间 门票 动线",
  },
  {
    id: "food",
    nodeName: "food_research",
    title: "美食研究",
    focus: "餐厅 小吃 咖啡 甜品 夜市 本地特色 排队 预约 人均",
  },
  {
    id: "stay",
    nodeName: "stay_research",
    title: "住宿商圈研究",
    focus: "住宿 酒店 民宿 商圈 交通便利 地铁 周边 配套",
  },
];

export function buildResearchQuery(
  destination: string,
  preferences: string[],
  dayCount: number,
  verticalId: ResearchVerticalId
): string {
  const vertical = RESEARCH_VERTICALS.find((item) => item.id === verticalId) ?? RESEARCH_VERTICALS[0]!;
  return `${destination} ${dayCount}天 ${preferences.join(" ")} ${vertical.focus} 旅行攻略`;
}
