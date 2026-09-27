import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {stripTypeScriptTypes} from 'node:module';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const budgetUrl = moduleUrl(fs.readFileSync(new URL('../lib/map-budget.ts', import.meta.url), 'utf8'));
const {reserveMapRequest} = await import(budgetUrl);
const {mapProxy} = await import(moduleUrl(fs.readFileSync(new URL('../lib/amap-proxy.ts', import.meta.url), 'utf8').replace("'./map-budget'", JSON.stringify(budgetUrl))));
const migration = fs.readFileSync(new URL('../drizzle/0003_unknown_lilandra.sql', import.meta.url), 'utf8');
const now = Date.parse('2026-09-10T04:00:00Z');
const cfg = {key: 'test-key', security: 'test-security'};
function db() {
  const sql = new DatabaseSync(':memory:'); sql.exec(migration);
  return {sql, prepare(query) {
    let values = [];
    return {bind(...args) {values = args; return this;}, async first() {return sql.prepare(query).get(...values) || null;}, async run() {return sql.prepare(query).run(...values);}};
  }, async batch(statements) {return Promise.all(statements.map(s => s.run()));}};
}
const request = (query = 'location=110,22') => new Request('https://example.test/_AMapService/v3/geocode/regeo?' + query);
const good = () => Response.json({status: '1', regeocode: {formatted_address: '模拟地点'}});

test('同时申请不会越过每日上限，次日重置，月上限保留', async () => {
  const database = db();
  const results = await Promise.all(Array.from({length: 305}, () => reserveMapRequest(database, 'service', now)));
  assert.equal(results.filter(Boolean).length, 300);
  assert.equal(await reserveMapRequest(database, 'service', now + 86400000), true);
  database.sql.exec('UPDATE map_usage SET monthly_count = 5000');
  assert.equal(await reserveMapRequest(database, 'service', now + 2 * 86400000), false);
  assert.equal(await reserveMapRequest(database, 'service', Date.parse('2026-10-01T00:00:00Z')), true);
  database.sql.close();
});
test('海外与高德服务分开计数，午夜按北京时间重置', async () => {
  const database = db(); const time = Date.parse('2026-09-10T15:59:59Z');
  for (let i=0; i<300; i++) assert.equal(await reserveMapRequest(database, 'worldService', time), true);
  assert.equal(await reserveMapRequest(database, 'worldService', time), false);
  assert.equal(await reserveMapRequest(database, 'service', time), true);
  assert.equal(await reserveMapRequest(database, 'worldService', time + 1000), true);
  database.sql.close();
});
test('跨 JSONP 回调共用缓存，上游只收到本站域名和服务器密钥', async () => {
  const database = db(); let calls = 0;
  const fetcher = async (url, options) => {
    calls++; const u = new URL(url);
    assert.equal(u.host, 'restapi.amap.com'); assert.equal(u.searchParams.get('jscode'), cfg.security);
    assert.equal(u.searchParams.get('key'), cfg.key); assert.equal(u.searchParams.has('callback'), false);
    assert.equal(options.headers.Referer, 'https://example.test/'); assert.equal(options.redirect, 'manual'); return good();
  };
  const first = await mapProxy(request('location=110,22&callback=first&key=ignored&csid=first-browser'), 'v3/geocode/regeo', database, cfg, fetcher, now);
  const second = await mapProxy(request('callback=second&location=110,22&csid=second-browser'), 'v3/geocode/regeo', database, cfg, fetcher, now);
  assert.match(await first.text(), /^first\(/); assert.match(await second.text(), /^second\(/);
  assert.equal(second.headers.get('X-Map-Cache'), 'hit'); assert.equal(calls, 1);
  const stored = database.sql.prepare('SELECT * FROM map_cache').get();
  assert.ok(!JSON.stringify(stored).includes(cfg.security)); assert.ok(!JSON.stringify(stored).includes(cfg.key));
  database.sql.close();
});
test('坐标、查询参数或账号不同不会误用结果；过期重新查询', async () => {
  const database = db(); let calls = 0; const fetcher = async () => {calls++; return good();};
  for (const [query, config, time] of [['location=110,22', cfg, now], ['location=111,22', cfg, now], ['location=110,22&radius=500', cfg, now], ['location=110,22', {...cfg, key:'another'}, now], ['location=110,22', cfg, now + 86400001]]) {
    await mapProxy(request(query), 'v3/geocode/regeo', database, config, fetcher, time);
  }
  assert.equal(calls, 5); database.sql.close();
});
test('触顶后停止请求高德，已有缓存和定位接收不依赖新额度', async () => {
  const database = db(); let calls = 0; const fetcher = async () => {calls++; return good();};
  await mapProxy(request(), 'v3/geocode/regeo', database, cfg, fetcher, now);
  database.sql.exec('UPDATE map_usage SET daily_count = 300');
  const hit = await mapProxy(request(), 'v3/geocode/regeo', database, cfg, fetcher, now);
  const denied = await mapProxy(request('location=111,22'), 'v3/geocode/regeo', database, cfg, fetcher, now);
  assert.equal(hit.status, 200); assert.equal(hit.headers.get('X-Map-Cache'), 'hit');
  assert.equal(denied.status, 429); assert.equal(calls, 1); database.sql.close();
});
test('失败不缓存，路线不缓存，数据库失败时不绕过上限', async () => {
  const database = db(); let calls = 0;
  const fail = async () => {calls++; return Response.json({status:'0', info:'ERROR'});};
  for (let i=0; i<2; i++) await mapProxy(request(), 'v3/geocode/regeo', database, cfg, fail, now);
  const route = async () => {calls++; return good();};
  for (let i=0; i<2; i++) await mapProxy(request(), 'v3/direction/driving', database, cfg, route, now);
  assert.equal(calls, 4); assert.equal(database.sql.prepare('SELECT COUNT(*) AS n FROM map_cache').get().n, 0);
  database.sql.close();
  const unavailable = await mapProxy(request(), 'v3/geocode/regeo', database, cfg, route, now);
  assert.equal(unavailable.status, 503); assert.equal(calls, 4);
});
test('不支持的路径和恶意 JSONP 被拒绝，不能把浏览器参数拼成脚本', async () => {
  const database = db(); const never = async () => {throw Error('must not call');};
  assert.equal((await mapProxy(request(), 'https://evil.test', database, cfg, never, now)).status, 404);
  assert.equal((await mapProxy(request('callback=alert(1)//'), 'v3/geocode/regeo', database, cfg, never, now)).status, 400);
  assert.equal((await mapProxy(request('x='+'a'.repeat(6001)), 'v3/geocode/regeo', database, cfg, never, now)).status, 413);
  database.sql.close();
});
test('上游重定向不跟随，不把密钥转发到其他主机', async () => {
  const database = db(); let calls = 0;
  const response = await mapProxy(request(), 'v3/geocode/regeo', database, cfg, async (url, options) => {
    calls++; assert.equal(options.redirect, 'manual'); return new Response(null, {status:302, headers:{location:'https://wrong.invalid/'}});
  }, now);
  assert.equal(response.status, 502); assert.equal((await response.json()).info, 'MAP_UPSTREAM_HTTP_302'); assert.equal(calls, 1); database.sql.close();
});
test('高德授权错误回显的安全字段不会返回浏览器',async()=>{
 const database=db();const response=await mapProxy(request(),'v3/geocode/regeo',database,cfg,async()=>Response.json({status:'0',info:'INVALID_USER_DOMAIN',sec_code:cfg.security,sec_code_debug:cfg.security,jscode:cfg.security,securityJsCode:cfg.security}),now);
 const data=await response.json();assert.equal(data.info,'INVALID_USER_DOMAIN');assert.doesNotMatch(JSON.stringify(data),new RegExp(cfg.security));database.sql.close();
});
