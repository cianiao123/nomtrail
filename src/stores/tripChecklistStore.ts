import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ChecklistCategoryId = "todo" | "documents" | "clothing" | "electronics";

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface ChecklistCategory {
  id: ChecklistCategoryId;
  title: string;
  subtitle: string;
  tone: "blue" | "violet" | "rose" | "amber";
  items: ChecklistItem[];
}

interface TripChecklistState {
  checklistsByTripId: Record<string, ChecklistCategory[]>;
  ensureChecklist: (tripId: string) => void;
  toggleItem: (tripId: string, categoryId: ChecklistCategoryId, itemId: string) => void;
  addItem: (tripId: string, categoryId: ChecklistCategoryId, label: string) => void;
  applyGeneratedChecklist: (
    tripId: string,
    items: { categoryId: ChecklistCategoryId; label: string }[]
  ) => void;
}

function createDefaultChecklist(): ChecklistCategory[] {
  return [
    {
      id: "todo",
      title: "待办事项",
      subtitle: "出发前确认事项",
      tone: "violet",
      items: [
        { id: "todo-ticket", label: "确认往返交通票据", checked: false },
        { id: "todo-hotel", label: "确认酒店/民宿订单", checked: false },
        { id: "todo-tickets", label: "预约或购买重点景点门票", checked: false },
        { id: "todo-weather", label: "查看目的地天气", checked: false },
        { id: "todo-route", label: "下载离线地图或收藏路线", checked: false },
      ],
    },
    {
      id: "documents",
      title: "重要证件",
      subtitle: "身份与订单凭证",
      tone: "blue",
      items: [
        { id: "doc-id", label: "身份证/护照", checked: false },
        { id: "doc-student", label: "学生证、老年证等优惠证件", checked: false },
      ],
    },
    {
      id: "clothing",
      title: "衣物穿搭",
      subtitle: "按天气与活动准备",
      tone: "rose",
      items: [
        { id: "cloth-shoes", label: "舒适运动鞋", checked: false },
        { id: "cloth-coat", label: "外套或防晒衣", checked: false },
        { id: "cloth-change", label: "换洗衣物", checked: false },
      ],
    },
    {
      id: "electronics",
      title: "数码电子",
      subtitle: "充电与拍摄设备",
      tone: "amber",
      items: [
        { id: "ele-phone", label: "手机", checked: false },
        { id: "ele-power", label: "充电宝", checked: false },
        { id: "ele-cable", label: "数据线/充电器", checked: false },
        { id: "ele-earphone", label: "耳机", checked: false },
      ],
    },
  ];
}

export const useTripChecklistStore = create<TripChecklistState>()(
  persist(
    (set, get) => ({
      checklistsByTripId: {},

      ensureChecklist: (tripId) => {
        if (!tripId || get().checklistsByTripId[tripId]) return;
        set((state) => ({
          checklistsByTripId: {
            ...state.checklistsByTripId,
            [tripId]: createDefaultChecklist(),
          },
        }));
      },

      toggleItem: (tripId, categoryId, itemId) => {
        set((state) => ({
          checklistsByTripId: {
            ...state.checklistsByTripId,
            [tripId]: (state.checklistsByTripId[tripId] ?? createDefaultChecklist()).map((category) =>
              category.id === categoryId
                ? {
                    ...category,
                    items: category.items.map((item) =>
                      item.id === itemId ? { ...item, checked: !item.checked } : item
                    ),
                  }
                : category
            ),
          },
        }));
      },

      addItem: (tripId, categoryId, label) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        set((state) => ({
          checklistsByTripId: {
            ...state.checklistsByTripId,
            [tripId]: (state.checklistsByTripId[tripId] ?? createDefaultChecklist()).map((category) =>
              category.id === categoryId
                ? {
                    ...category,
                    items: [
                      ...category.items,
                      {
                        id: `${categoryId}-${Date.now()}`,
                        label: trimmed,
                        checked: false,
                      },
                    ],
                  }
                : category
            ),
          },
        }));
      },

      applyGeneratedChecklist: (tripId, items) => {
        const normalizedItems = items
          .map((item) => ({ ...item, label: item.label.trim() }))
          .filter((item) => item.label);
        if (!tripId || normalizedItems.length === 0) return;

        set((state) => {
          const previous = state.checklistsByTripId[tripId] ?? createDefaultChecklist();
          const previousCheckedByLabel = new Map(
            previous.flatMap((category) =>
              category.items.map((item) => [`${category.id}:${item.label}`, item.checked] as const)
            )
          );

          return {
            checklistsByTripId: {
              ...state.checklistsByTripId,
              [tripId]: createDefaultChecklist().map((category) => {
                const generated = normalizedItems.filter((item) => item.categoryId === category.id);
                if (generated.length === 0) return category;

                return {
                  ...category,
                  items: generated.map((item, index) => ({
                    id: `${category.id}-generated-${index}-${item.label.slice(0, 8)}`,
                    label: item.label,
                    checked: previousCheckedByLabel.get(`${category.id}:${item.label}`) ?? false,
                  })),
                };
              }),
            },
          };
        });
      },
    }),
    {
      name: "nomtrail-trip-checklists",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
