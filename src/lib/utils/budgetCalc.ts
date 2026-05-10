export function formatBudget(min: number, max: number): string {
  if (max >= 50000) return '¥' + (min / 10000).toFixed(1) + 'w+';
  return `¥${min.toLocaleString()} - ¥${max.toLocaleString()}`;
}

export function formatCost(amount: number): string {
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(1)}w`;
  return `¥${amount.toLocaleString()}`;
}

export function getBudgetLevel(min: number, max: number): string {
  const avg = (min + max) / 2;
  if (avg < 3000) return '经济';
  if (avg < 8000) return '舒适';
  if (avg < 20000) return '品质';
  return '奢华';
}
