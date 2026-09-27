import {reserveMapRequest} from './map-budget';

const allowed = new Set(['v3/geocode/regeo', 'v3/assistant/coordinate/convert', 'v3/direction/driving', 'v5/direction/driving', 'v4/map/styles', 'v3/log/init']);
const cached = new Set(['v3/geocode/regeo', 'v3/assistant/coordinate/convert']);
const DAY = 86400000;

function reply(body: string, status: number, callback: string | null, cache: string) {
  // JSONP callbacks belong to the SDK. Never interpolate arbitrary script.
  return new Response(callback ? `${callback}(${body});` : body, {status, headers: {
    'Content-Type': callback ? 'application/javascript; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Map-Cache': cache,
  }});
}

export async function mapProxy(req: Request, path: string, database: D1Database,
  config: {key: string; security: string}, fetcher: typeof fetch = fetch, now = Date.now()) {
  if (!allowed.has(path)) return new Response('Unsupported map service', {status: 404});
  const input = new URL(req.url);
  if (input.search.length > 6000) return new Response('Request too large', {status: 413});
  const callback = input.searchParams.get('callback');
  if (callback !== null && (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callback) || callback.length > 120)) {
    return new Response('Invalid callback', {status: 400});
  }
  const error = (info: string, status: number) => reply(JSON.stringify({status: '0', info}), callback ? 200 : status, callback, 'none');
  let stage = 'CACHE';
  try {
    const query = new URLSearchParams(input.searchParams);
    // Ask upstream for JSON so one cached result can serve different JSONP callers.
    for (const key of ['callback', 'key', 'jscode']) query.delete(key);
    query.sort();
    const cacheQuery = new URLSearchParams(query);
    // Amap's per-request trace ID changes across visitors; it does not change the location result.
    cacheQuery.delete('csid');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${config.key}:${path}?${cacheQuery}`));
    const cacheKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (cached.has(path)) {
      const hit = await database.prepare('SELECT body FROM map_cache WHERE cache_key = ? AND expires_at > ?').bind(cacheKey, now).first<{body: string}>();
      if (hit) return reply(hit.body, 200, callback, 'hit');
    }
    stage = 'LIMIT';
    if (!await reserveMapRequest(database, 'service', now)) return error('SITE_MAP_LIMIT_REACHED', 429);
    query.set('key', config.key);
    query.set('jscode', config.security);
    const upstream = (path === 'v4/map/styles' ? 'https://webapi.amap.com/' : 'https://restapi.amap.com/') + path + '?' + query;
    stage = 'UPSTREAM';
    const response = await fetcher(upstream, {
      // This runtime supports manual/follow; reject redirects below without following them.
      signal: AbortSignal.timeout(12000), redirect: 'manual',
      // Only the site's own origin; private URL fragments are never forwarded.
      headers: {Referer: input.origin + '/', Origin: input.origin},
    });
    stage = 'RESPONSE';
    if (!response.ok) return error(`MAP_UPSTREAM_HTTP_${response.status}`, 502);
    const result = await response.json() as Record<string,unknown> & {status?: string};
    // Some authorization errors echo security parameters. They must stay server-side.
    for(const field of ['sec_code','sec_code_debug','jscode','securityJsCode'])delete result[field];
    const body = JSON.stringify(result);
    if (response.ok && result.status === '1' && cached.has(path) && body.length <= 128000) {
      await database.batch([
        database.prepare('DELETE FROM map_cache WHERE expires_at <= ?').bind(now),
        database.prepare('INSERT INTO map_cache (cache_key, body, expires_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, expires_at = excluded.expires_at').bind(cacheKey, body, now + DAY),
      ]);
    }
    return reply(body, response.status, callback, 'miss');
  } catch {
    // Fail closed when the counter/database is unavailable; do not call around it.
    return error(`MAP_${stage}_UNAVAILABLE`, 503);
  }
}
