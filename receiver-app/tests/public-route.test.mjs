import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';

// Exercise the real request handler and SQL without a network listener.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../drizzle/0002_many_boom_boom.sql', import.meta.url), 'utf8'));
sqlite.exec(readFileSync(new URL('../drizzle/0004_neat_scourge.sql', import.meta.url), 'utf8'));
globalThis.__relayTestDB = {prepare(sql) {
  const statement = sqlite.prepare(sql);
  let values = [];
  return {bind(...args) {values = args; return this;},
    async first() {return statement.get(...values) ?? null;},
    async all() {return {results: statement.all(...values)};},
    async run() {return statement.run(...values);}};
}};
const hook = registerHooks({resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return {url:'data:text/javascript,export const env={DB:globalThis.__relayTestDB};',shortCircuit:true};
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const file = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(file)) return next(file.href, context);
  }
  return next(specifier, context);
}});
const {GET, POST} = await import('../app/api/public-positions/route.ts');
after(() => {hook.deregister(); sqlite.close(); delete globalThis.__relayTestDB;});
const make = accuracy => ({id:crypto.randomUUID(), label:'离线接口测试', mode:'auto', notice:'public-location-v1',
  position:{lat:22.63,lon:110.16,accuracy,crs:'WGS84',timestamp:new Date().toISOString()}});
const post = (value, origin='https://relay.test') => POST(new Request('https://relay.test/api/public-positions',
  {method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)}));

test('实际接收接口接受并如实保存80米、300米和3000米的自动回传', async () => {
  for (const accuracy of [80,300,3000]) {
    const payload = make(accuracy);
    assert.equal((await post(payload)).status, 200);
    const {records} = await (await GET()).json();
    assert.equal(records.find(r => r.id === payload.id).accuracy, accuracy);
  }
});
test('发送重试只留一条，相同编号不能覆盖原坐标', async () => {
  const payload = make(80);
  const first = await (await post(payload)).json();
  assert.deepEqual(await (await post(payload)).json(), first);
  assert.equal((await post({...payload,position:{...payload.position,lat:23}})).status, 409);
  const {records} = await (await GET()).json();
  assert.equal(records.filter(r => r.id === payload.id).length, 1);
});
test('放宽精度仍拒绝过时数据、非法坐标与非法精度', async () => {
  const payload = make(80);
  for (const change of [{lat:91},{accuracy:-1},{timestamp:new Date(Date.now()-660000).toISOString()}]) {
    assert.equal((await post({...payload,position:{...payload.position,...change}})).status, 400);
  }
});
test('公开用途说明及同源写入校验保留', async () => {
  const payload = make(80);
  assert.equal((await post({...payload,notice:''})).status, 400);
  assert.equal((await post(payload,'https://wrong.test')).status, 403);
});
const {PATCH}=await import('../app/api/public-positions/[id]/route.ts');
const v2=()=>({...make(80),notice:'public-location-v2',updateToken:crypto.randomUUID().replaceAll('-','').repeat(2)});
const refine=(p,change={})=>({updateToken:p.updateToken,position:{...p.position,accuracy:20,timestamp:new Date(Date.parse(p.position.timestamp)+1000).toISOString(),...change}});
const patch=(p,value=refine(p))=>PATCH(new Request('https://relay.test/api/public-positions/'+p.id,{method:'PATCH',headers:{origin:'https://relay.test','content-type':'application/json'},body:JSON.stringify(value)}),{params:Promise.resolve({id:p.id})});
test('新版精度更新同一条记录，首次POST与更新PATCH都可幂等重试',async()=>{const p=v2();assert.equal((await post(p)).status,200);const r=await(await patch(p)).json();assert.equal(r.revision,1);assert.deepEqual(await(await patch(p)).json(),r);assert.deepEqual(await(await post(p)).json(),r);const {records}=await(await GET()).json();const saved=records.filter(x=>x.id===p.id);assert.equal(saved.length,1);assert.equal(saved[0].accuracy,20);assert.ok(saved[0].updated_at);assert.ok(!('update_token_hash' in saved[0]));assert.ok(!('initial_snapshot' in saved[0]));});
test('无令牌和错误令牌不能覆盖位置，旧v1记录继续读取但不能精度更新',async()=>{const p=v2();await post(p);assert.equal((await patch(p,{...refine(p),updateToken:'f'.repeat(64)})).status,403);assert.equal((await patch(p,{position:refine(p).position})).status,400);const old=make(80);await post(old);assert.equal((await patch(old,{...refine(old),updateToken:p.updateToken})).status,403);});
test('不达改善门槛、改变坐标系、超过20秒的更新被拒绝',async()=>{const p=v2();await post(p);for(const change of [{accuracy:70},{crs:'GCJ02'},{timestamp:new Date(Date.parse(p.position.timestamp)+21000).toISOString()},{timestamp:p.position.timestamp}])assert.equal((await patch(p,refine(p,change))).status,400);});
test('只能更新一次，第二次不同位置不能覆盖',async()=>{const p=v2();await post(p);await patch(p);assert.equal((await patch(p,refine(p,{accuracy:5}))).status,409);assert.equal((await post({...p,position:{...p.position,lat:23}})).status,409);});
test('首次送达超过2分钟不允许新更新，但已存更新的重试仍确认成功',async()=>{const p=v2();await post(p);sqlite.prepare('UPDATE public_positions SET received_at=? WHERE id=?').run(Date.now()-121000,p.id);assert.equal((await patch(p)).status,410);const q=v2();await post(q);await patch(q);sqlite.prepare('UPDATE public_positions SET received_at=? WHERE id=?').run(Date.now()-121000,q.id);assert.equal((await patch(q)).status,200);});
test('并行POST/PATCH不产生重复记录，也不能多次覆盖',async()=>{const p=v2();const responses=await Promise.all([post(p),post(p)]);assert.ok(responses.every(r=>r.status===200));const updates=await Promise.all([patch(p),patch(p)]);assert.ok(updates.every(r=>r.status===200));assert.equal(sqlite.prepare('SELECT count(*) AS n FROM public_positions WHERE id=?').get(p.id).n,1);});
