export const APP_NAME = 'NomTrail';

export const PREFERENCE_TAGS = [
  '自然风光', '历史文化', '美食探索', '购物娱乐',
  '亲子出游', '蜜月浪漫', '户外冒险', '休闲度假',
  '摄影打卡', '深度小众', '城市漫步', '自驾旅行',
] as const;

export const BUDGET_OPTIONS = [
  { label: '经济实惠', min: 1000, max: 3000 },
  { label: '舒适出行', min: 3000, max: 8000 },
  { label: '品质享受', min: 8000, max: 20000 },
  { label: '奢华体验', min: 20000, max: 100000 },
] as const;

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  attraction: '景点',
  food: '美食',
  hotel: '住宿',
  transport: '交通',
  other: '其他',
};

export const ACTIVITY_TYPE_ICONS: Record<string, string> = {
  attraction: 'attractions',
  food: 'restaurant',
  hotel: 'hotel',
  transport: 'directions_bus',
  other: 'place',
};

export const DAY_COLORS = [
  '#0f3764', '#1b4965', '#2d6f9f', '#526579',
  '#285c83', '#16466f', '#3f6f95',
];

export const TRENDING_DESTINATIONS = [
  {
    name: '京都，日本',
    subtitle: '京都，日本',
    category: '人文历史',
    description: '沉浸在古老传统、竹林小径与极简建筑之间。',
    duration: '5-7 天',
    costLevel: '¥¥¥',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAbSKI9p-3Wrd8hgkwMneNFvP2-CFxnwvyjxsOfw_JGijH2H0K4giCx57RkPgNCzUJBjPasMjieQeua3DLzARaeV9VzCRwBWh8Q3P2XJ4ndTGsL-8m2BKCbJAFXbWOFVX3Uc_fT0tWBQHiXF8TSOBxlVf2mdsjm5WScJxSRriFKkSzTgqzT96kund_tb_i2gEkDJ5VwyMvGAOdvUBpcS4g_2ozHlkxGMG3t01-0R_TptdvfOgbzPfG4ZKEuMtPzyUongjbfQnXoFdY',
  },
  {
    name: '巴塔哥尼亚，智利',
    subtitle: '巴塔哥尼亚，智利',
    category: '自然风光',
    description: '感受群峰、冰川与原始荒野交织出的辽阔气息。',
    duration: '10-14 天',
    costLevel: '¥¥¥¥',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD-vORP1nXoN82GgmT1MHG_CcABdl34_SdfFqcVUq7oviyjX9MjHdc_tWIRPdNIkcpA32xBgbvs8tVR2RWixErC2nwEixJJ5i1vY_2m1GLoMZXgEwxgCFSURuEyoUbYXgqBUS61gm0scBNoAv55eDn1SX9yS6GCD49kuPwwhBkFtBE5j4bPLCNwzWXb6zd4PPRmruyUdwAQ_e5KpMxbitYa1wIGNEnIuXeD0vPAXtW7vk-DllFUKXNEJCL7x5bBUo6AwHR_RwPRCk8',
  },
  {
    name: '巴黎，法国',
    subtitle: '巴黎，法国',
    category: '城市漫步',
    description: '探索隐秘庭院、安静咖啡馆与更克制精致的城市侧面。',
    duration: '4-6 天',
    costLevel: '¥¥¥',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDbOpDG1Ncy0PEkBn0o3RYGwl4XdARXlorvyWvQMPs1V4_8UOwhjEzPD3WTgqeR6JvU3cKvbE3bz_FC9ONIcIMbhUi_BtCPhFu5w5sgBSNz7SjcK1O9zcjtQi6ESbFiJbdeW80UTrdeAp0FPFxqmXpP_UClpy3v8ACbvHRqv4V74rOk7nM_Cpbg65qpc_Q5s0e94WSuNbSGKo5HI30X15JYghGMOtOfonAjkxx-gwVJzGPKsHUWNV8TSQpoLt46C-ajEg41jAgiN1E',
  },
];
