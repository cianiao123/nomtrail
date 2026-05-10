// Gap-spaced ordering: assign orders at 1000, 2000, 3000...
// Insert between two items: (prevOrder + nextOrder) / 2
// This allows O(1) reorder without rewriting all records

const GAP = 1000;

export function assignOrders(count: number, start = 0): number[] {
  return Array.from({ length: count }, (_, i) => (start + i + 1) * GAP);
}

export function insertOrder(prevOrder: number | null, nextOrder: number | null): number {
  const prev = prevOrder ?? 0;
  const next = nextOrder ?? (prev + GAP * 2);
  return Math.round((prev + next) / 2);
}

export function needsReindex(orders: number[]): boolean {
  if (orders.length === 0) return false;
  const sorted = [...orders].sort((a, b) => a - b);
  // If gap between consecutive items is too small (< 10), reindex
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! < 10) return true;
  }
  return false;
}

export function reindex(orders: number[]): number[] {
  return assignOrders(orders.length);
}
