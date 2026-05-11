import type { SavedPlaceCandidate } from "@/types/agent";
import type { ActivityType, Day } from "@/types/trip";

export function normalizeWishlistName(name: string) {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s+/g, "")
    .replace(/[·・,，。.\-—_]/g, "")
    .toLowerCase();
}

export function extractWishlistNamesFromContext(context: string) {
  const match = context.match(/心愿地点加入行程[:：]([^\n。]+)/);
  if (!match?.[1]) return [];

  return match[1]
    .split(/[、,，]/)
    .map((name) => name.trim())
    .map((name) => name.replace(/^(直接|马上|现在)?(帮我|请你|你来)?(规划|安排|生成)(行程)?吧?$/, ""))
    .filter(Boolean);
}

export function isWishlistActivity(activityName: string, wishlistNames: string[]) {
  const normalizedActivityName = normalizeWishlistName(activityName);
  return wishlistNames.some((wishlistName) => {
    const normalizedWishlistName = normalizeWishlistName(wishlistName);
    return normalizedWishlistName
      && (normalizedActivityName.includes(normalizedWishlistName)
        || normalizedWishlistName.includes(normalizedActivityName));
  });
}

export function markWishlistSource(sourceReason: string | undefined) {
  const value = sourceReason ?? "";
  return value.includes("心愿地") ? value : `[心愿地]${value ? ` ${value}` : ""}`;
}

export function markWishlistNotes(notes: string | undefined) {
  const value = notes ?? "";
  return value.includes("心愿地") ? value : `心愿地：${value || "来自探索页心愿池。"}`;
}

function inferWishlistCategory(name: string): SavedPlaceCandidate["category"] {
  if (/餐厅|饭店|小吃|咖啡|甜品|茶|酒吧|食堂|面馆|火锅|烤肉/.test(name)) return "food";
  if (/酒店|民宿|客栈|宾馆/.test(name)) return "hotel";
  return "attraction";
}

export function mergeWishlistCandidates(
  wishlistNames: string[],
  destination: string,
  candidates: SavedPlaceCandidate[]
) {
  const wishlistCandidates: SavedPlaceCandidate[] = wishlistNames.map((name) => ({
    name,
    city: destination,
    category: inferWishlistCategory(name),
    priorityTag: "must_go",
    reason: "来自探索页心愿池，用户明确希望加入行程。",
    sourceRefs: ["探索页心愿池"],
    qualityScore: 1,
  }));

  const wishlistKeys = new Set(
    wishlistCandidates.map((candidate) => normalizeWishlistName(candidate.name))
  );
  const remaining = candidates.filter(
    (candidate) => !wishlistKeys.has(normalizeWishlistName(candidate.name))
  );

  return [...wishlistCandidates, ...remaining];
}

function nextWishlistTime(activityCount: number) {
  const startHour = Math.min(18, 9 + activityCount * 3);
  const endHour = Math.min(20, startHour + 2);
  return {
    startTime: `${String(startHour).padStart(2, "0")}:00`,
    endTime: `${String(endHour).padStart(2, "0")}:00`,
  };
}

export function appendMissingWishlistActivities(
  days: Day[],
  wishlistNames: string[],
  threadId: string
) {
  if (!days.length || !wishlistNames.length) return days;

  const missingNames = wishlistNames.filter((name) =>
    !days.some((day) =>
      day.activities.some((activity) =>
        isWishlistActivity(activity.customName || activity.poi?.name || "", [name])
      )
    )
  );
  if (!missingNames.length) return days;

  const nextDays = days.map((day) => ({ ...day, activities: [...day.activities] }));
  missingNames.forEach((name, index) => {
    const targetDay = nextDays[index % nextDays.length];
    if (!targetDay) return;
    const activityCount = targetDay.activities.length;
    const { startTime, endTime } = nextWishlistTime(activityCount);

    targetDay.activities.push({
      id: `${threadId}-wishlist-${targetDay.dayIndex}-${index}`,
      dayId: targetDay.id,
      order: (activityCount + 1) * 1000,
      type: inferWishlistCategory(name) as ActivityType,
      poi: null,
      customName: name,
      startTime,
      endTime,
      durationMinutes: 120,
      estimatedCost: 0,
      notes: "心愿地：来自探索页心愿池，已自动加入，可在详情页继续调整时间和顺序。",
      sourceReason: "[心愿地] 来自探索页心愿池",
      bookingRequired: false,
      weatherFit: "any",
      isGenerated: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  return nextDays;
}
