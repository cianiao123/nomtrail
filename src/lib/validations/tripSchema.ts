import { z } from 'zod';

export const preferenceTagSchema = z.enum([
  '自然风光', '历史文化', '美食探索', '购物娱乐',
  '亲子出游', '蜜月浪漫', '户外冒险', '休闲度假',
  '摄影打卡', '深度小众', '城市漫步', '自驾旅行',
]);

export const createTripSchema = z.object({
  title: z.string().min(1, '请输入行程标题').max(100),
  destination: z.string().min(1, '请输入目的地'),
  destinationCoord: z.object({ lat: z.number(), lng: z.number() }),
  startDate: z.string().min(1, '请选择出行日期'),
  endDate: z.string().min(1, '请选择结束日期'),
  travelers: z.object({
    adults: z.number().min(1, '至少1位成人'),
    children: z.number().min(0),
  }),
  budget: z.object({
    currency: z.string().default('CNY'),
    min: z.number().min(0),
    max: z.number().min(0),
  }),
  preferences: z.array(preferenceTagSchema).min(1, '请至少选择1个偏好'),
  naturalLanguageInput: z.string().optional(),
});

export type CreateTripInput = z.infer<typeof createTripSchema>;

export const addActivitySchema = z.object({
  dayId: z.string(),
  type: z.enum(['attraction', 'food', 'hotel', 'transport', 'other']),
  amapId: z.string().optional(),
  customName: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
});
