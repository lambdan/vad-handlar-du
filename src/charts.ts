import { STATICS } from ".";

export async function monthlySpending() {
  const receipts = await STATICS.pg.fetchReceipts();
  // Sort by date
  receipts.sort((a, b) => a.date.getTime() - b.date.getTime());
  const months = new Map<string, number>();
  for (const r of receipts) {
    const month = r.date.toISOString().slice(0, 7);
    if (!months.has(month)) {
      months.set(month, 0);
    }
    months.set(month, months.get(month)! + r.total);
  }

  return {
    keys: Array.from(months.keys()),
    values: Array.from(months.values()),
  };
}
