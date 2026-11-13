// Analýza › Dokumenty › Vývoj v čase: how the stored files grew month by month
// and what keeping them costs. Pure, so it is tested without a database.
//
// A file counts in a month's total from the month it was uploaded until the
// month it was deleted. Deletions are known only from the change log
// (documents deleted since 2026-10); a file deleted before that left no trace,
// so earlier totals can be slightly low but never include a file twice.

const GB = 1024 ** 3;

// "2026-04" in Prague time.
const monthFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit' });
export const monthKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : monthFormatter.format(date).slice(0, 7);
};

export function nextMonth(key) {
  const [year, month] = key.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

// Monthly cost of keeping `bytes` on Railway's disk, in CZK.
export const diskCostCzk = (bytes, { prices, usdCzk }) => (bytes / GB) * prices.railwayDiskUsdPerGbMonth * usdCzk;

/**
 * files:     files in the app now, [{ createdAt, sizeBytes }]
 * deletions: deleted files from the change log, [{ createdAt, deletedAt, sizeBytes }]
 * Returns one row per month from the first upload to `now`, and a summary.
 */
export function monthlyHistory({ files = [], deletions = [], now = new Date(), prices, usdCzk }) {
  const added = new Map();
  const removed = new Map();
  const bump = (map, key, bytes) => {
    if (!key) return;
    const entry = map.get(key) ?? { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += bytes;
    map.set(key, entry);
  };
  for (const file of files) bump(added, monthKey(file.createdAt), Number(file.sizeBytes) || 0);
  for (const file of deletions) {
    const size = Number(file.sizeBytes) || 0;
    bump(added, monthKey(file.createdAt) ?? monthKey(file.deletedAt), size);
    bump(removed, monthKey(file.deletedAt), size);
  }

  const keys = [...added.keys(), ...removed.keys()].sort();
  const months = [];
  if (keys.length > 0) {
    const last = monthKey(now);
    let totalBytes = 0;
    let totalCount = 0;
    for (let key = keys[0]; key <= last; key = nextMonth(key)) {
      const add = added.get(key) ?? { count: 0, bytes: 0 };
      const remove = removed.get(key) ?? { count: 0, bytes: 0 };
      totalBytes += add.bytes - remove.bytes;
      totalCount += add.count - remove.count;
      months.push({
        month: key,
        addedCount: add.count,
        addedBytes: add.bytes,
        removedCount: remove.count,
        removedBytes: remove.bytes,
        netBytes: add.bytes - remove.bytes,
        totalBytes,
        totalCount,
        costCzk: diskCostCzk(totalBytes, { prices, usdCzk }),
      });
      if (months.length > 240) break;
    }
  }

  // Growth: the average net change of the last six months (or fewer, if the
  // history is shorter), and where that leads in a year.
  const recent = months.slice(-6);
  const avgMonthlyBytes = recent.length ? recent.reduce((sum, row) => sum + row.netBytes, 0) / recent.length : 0;
  const totalBytes = months.at(-1)?.totalBytes ?? 0;
  const in12Bytes = Math.max(0, totalBytes + avgMonthlyBytes * 12);
  const busiest = months.reduce((best, row) => (row.addedBytes > (best?.addedBytes ?? 0) ? row : best), null);
  return {
    months,
    summary: {
      totalBytes,
      costCzk: diskCostCzk(totalBytes, { prices, usdCzk }),
      costPerGbCzk: prices.railwayDiskUsdPerGbMonth * usdCzk,
      ramCostPerGbCzk: prices.railwayRamUsdPerGbMonth * usdCzk,
      avgMonthlyBytes,
      averagedMonths: recent.length,
      in12Bytes,
      in12CostCzk: diskCostCzk(in12Bytes, { prices, usdCzk }),
      busiestMonth: busiest ? { month: busiest.month, addedBytes: busiest.addedBytes, addedCount: busiest.addedCount } : null,
      deletionsTrackedSince: '2026-10',
    },
  };
}
