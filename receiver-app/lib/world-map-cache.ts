// Workers for Platforms disables caches.default. Use a site-isolated named cache.
// Caching is an optimization: an unavailable cache must not hide a valid basemap.
export async function openWorldTileCache(storage: Pick<CacheStorage, 'open'>): Promise<Cache | undefined> {
  try { return await storage.open('location-relay-world-tiles-v1'); }
  catch { console.warn('world-map:cache-open-unavailable'); return undefined; }
}
