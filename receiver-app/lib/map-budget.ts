// Counts requests made by this site, not the Amap account's billed usage.
export const MAP_LIMITS = {
  service: {daily: 300, monthly: 5000},
  worldService: {daily: 300, monthly: 5000},
  worldTiles: {daily: 2000, monthly: 20000},
} as const;

export async function reserveMapRequest(database: D1Database, kind: keyof typeof MAP_LIMITS, now = Date.now()) {
  const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const bucket = `${kind}:${day.slice(0, 7)}`;
  const limits = MAP_LIMITS[kind];
  // A single conditional write remains bounded under simultaneous visitors.
  const row = await database.prepare(`INSERT INTO map_usage (bucket, day, daily_count, monthly_count)
    VALUES (?, ?, 1, 1)
    ON CONFLICT(bucket) DO UPDATE SET
      day = excluded.day,
      daily_count = CASE WHEN map_usage.day = excluded.day THEN map_usage.daily_count + 1 ELSE 1 END,
      monthly_count = map_usage.monthly_count + 1
    WHERE map_usage.monthly_count < ? AND (map_usage.day != excluded.day OR map_usage.daily_count < ?)
    RETURNING monthly_count`).bind(bucket, day, limits.monthly, limits.daily).first();
  return !!row;
}
