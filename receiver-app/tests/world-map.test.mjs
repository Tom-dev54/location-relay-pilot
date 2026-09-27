import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import './register-ts.mjs';
import {mapRegion,worldNavigation} from '../lib/map-region.ts';
import {worldPlace} from '../lib/world-place.ts';
import {worldMap} from '../lib/world-map-server.ts';
import {openWorldTileCache} from '../lib/world-map-cache.ts';
import {worldResource} from '../lib/world-map-resources.ts';
import {worldStyle,bilingualName,labelExpression} from '../lib/world-map-style.ts';
import {createExpression} from '@maplibre/maplibre-gl-style-spec';
const p=(lat,lon,crs='WGS84')=>({lat,lon,crs,accuracy:17});
test('按坐标选择国内外地图，泰国不会落入粗略矩形内的大陆转换',()=>{
 for(const a of [p(22.60255,110.154308),p(39.9042,116.4074),p(31.2304,121.4737),p(18.2528,109.5119)])assert.equal(mapRegion(a).provider,'amap');
 for(const a of [p(13.75,100.5),p(13.6858,100.7472),p(22.3,114.17),p(22.1987,113.5439),p(25.033,121.5654),p(1.35,103.8),p(27.7,85.3),p(21.03,105.83),p(51.5,-.12)])assert.equal(mapRegion(a).provider,'world');
 assert.equal(mapRegion(p(22.55,114.11)).nearBoundary,true);
});
test('旧GCJ02保留高德；海外外链保留原始经纬度且起点由地图取得',()=>{
 const point=p(13.75,100.5);assert.equal(mapRegion({...point,crs:'GCJ02'}).provider,'amap');assert.throws(()=>worldNavigation({...point,crs:'GCJ02'}));
 const a=new URL(worldNavigation(point).google),b=new URL(worldNavigation(point).apple);assert.equal(a.searchParams.get('destination'),'13.75,100.5');assert.equal(a.searchParams.has('origin'),false);assert.equal(b.searchParams.get('daddr'),'13.75,100.5');assert.equal(b.searchParams.has('saddr'),false);
});
const nearby={results:[{name:'อาคารทดสอบ',street:'ถนนตัวอย่าง',city:'Bangkok',country:'Thailand',formatted:'Test building, Bangkok',lat:13.75,lon:100.499625}]};
test('海外建筑相对方位使用真实返回点，精度粗不说具体建筑，远处对象不冒充附近',()=>{
 const place=worldPlace(nearby,p(13.75,100.5),17);assert.match(place.title,/อาคารทดสอบ附近/);assert.match(place.relative,/东侧约40米/);
 const rough=worldPlace(nearby,p(13.75,100.5),300);assert.equal(rough.relative,'');assert.doesNotMatch(rough.title+rough.address,/อาคารทดสอบ|Test building/);
 const far=worldPlace(nearby,p(13.6858,100.7472),17);assert.doesNotMatch(far.title,/อาคารทดสอบ/);assert.equal(far.relative,'');assert.equal(worldPlace({results:[]},p(13,100),10),null);
});
function database(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0003_unknown_lilandra.sql',import.meta.url),'utf8'));return {sql,prepare(q){let args=[];return{bind(...v){args=v;return this;},async first(){return sql.prepare(q).get(...args)||null;},async run(){return sql.prepare(q).run(...args);}};},async batch(s){return Promise.all(s.map(x=>x.run()));}};}
const now=Date.parse('2026-09-27T05:00:00Z'),key='private-test-key';
const request=(path='place?lat=13.75&lon=100.5&accuracy=17&crs=WGS84')=>new Request('https://test.invalid/api/world-map/'+path);
test('没有Key和无效参数均明确失败，不能代理任意主机或泄露Key',async()=>{
 const d=database();let calls=0;const never=async()=>{calls++;throw Error(key);};
 assert.equal((await (await worldMap(request('config'),'config',d,'',never)).json()).configured,false);
 assert.equal((await (await worldMap(request(),'place',d,'',never)).json()).code,'NOT_CONFIGURED');
 for(const [path,url] of [['evil','evil'],['place','place?lat=91&lon=100&accuracy=17&crs=WGS84'],['place','place?lat=13&lon=100&accuracy=17&crs=GCJ02'],['tile/20/0/0','tile/20/0/0'],['tile/1/3/0','tile/1/3/0']])assert.ok((await worldMap(request(url),path,d,key,never)).status>=400);
 assert.equal(calls,0);d.sql.close();
});
test('地点缓存跨浏览器复用，坐标/精度档位/账号变更不串用，过期重查',async()=>{
 const d=database();let calls=0;const upstream=async(url,o)=>{calls++;const u=new URL(url);assert.equal(u.host,'api.geoapify.com');assert.equal(u.searchParams.get('lat'),'13.75');assert.equal(o.redirect,'manual');return Response.json(nearby);};
 for(let i=0;i<2;i++)assert.equal((await worldMap(request(),'place',d,key,upstream,undefined,now)).status,200);
 assert.equal(calls,1);
 await worldMap(request('place?lat=13.75&lon=100.5&accuracy=300&crs=WGS84'),'place',d,key,upstream,undefined,now);
 await worldMap(request(),'place',d,'different-key',upstream,undefined,now);
 await worldMap(request(),'place',d,key,upstream,undefined,now+8*86400000);assert.equal(calls,4);
 assert.doesNotMatch(JSON.stringify(d.sql.prepare('SELECT * FROM map_cache').all()),/private-test-key|different-key/);d.sql.close();
});
test('授权、额度、无数据、超时分类明确，失败不会写入地点缓存',async()=>{
 const d=database();for(const [status,code] of [[401,'AUTH'],[403,'AUTH'],[429,'QUOTA'],[500,'UPSTREAM'],[302,'UPSTREAM']]){const r=await worldMap(request(),'place',d,key,async()=>new Response(key,{status}),undefined,now);const v=await r.json();assert.equal(v.code,code);assert.doesNotMatch(JSON.stringify(v),new RegExp(key));}
 assert.equal((await(await worldMap(request(),'place',d,key,async()=>Response.json({results:[]}),undefined,now)).json()).code,'EMPTY');
 assert.equal((await(await worldMap(request(),'place',d,key,async()=>{throw new DOMException(key,'TimeoutError');},undefined,now)).json()).code,'TIMEOUT');
 assert.equal(d.sql.prepare('SELECT count(*) n FROM map_cache').get().n,0);d.sql.close();
});
test('达到测试预算不再请求上游，已有地点缓存继续可用',async()=>{
 const d=database();let calls=0;const upstream=async()=>{calls++;return Response.json(nearby);};await worldMap(request(),'place',d,key,upstream,undefined,now);d.sql.exec('UPDATE map_usage SET daily_count=300');
 assert.equal((await worldMap(request(),'place',d,key,upstream,undefined,now)).status,200);
 assert.equal((await worldMap(request('place?lat=13.8&lon=100.5&accuracy=17&crs=WGS84'),'place',d,key,upstream,undefined,now)).status,429);assert.equal(calls,1);d.sql.close();
});
test('瓦片缓存响应可添加框架响应头，命中缓存不请求上游或扣预算',async()=>{
 const d=database();let calls=0;const immutable=await fetch('data:image/png;base64,iVBORw0KGgo=');
 assert.throws(()=>immutable.headers.set('X-Framework','1'));
 const r=await worldMap(request('tile/4/12/7'),'tile/4/12/7',d,key,async()=>{calls++;throw Error('unexpected');},{match:async()=>immutable},now);
 assert.equal(r.status,200);assert.doesNotThrow(()=>r.headers.set('X-Framework','1'));assert.equal(calls,0);assert.equal(d.sql.prepare('SELECT count(*) n FROM map_usage').get().n,0);d.sql.close();
});
test('路线只接受同源POST和WGS84，起点与路线不入数据库或GET URL',async()=>{
 const d=database(),payload={start:{lat:13.74,lon:100.49},end:{lat:13.75,lon:100.5},crs:'WGS84'};
 const req=(origin='https://test.invalid',data=payload)=>new Request('https://test.invalid/api/world-map/route',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
 let calls=0;const upstream=async url=>{calls++;const u=new URL(url);assert.equal(u.searchParams.get('waypoints'),'13.74,100.49|13.75,100.5');assert.equal(u.searchParams.get('lang'),'en');return Response.json({features:[{geometry:{type:'MultiLineString',coordinates:[[[100.49,13.74],[100.5,13.75]]]},properties:{distance:800,time:90}}],properties:{apiKey:key}});};
 assert.equal((await worldMap(request('route'),'route',d,key,upstream)).status,405);
 assert.equal((await worldMap(req('https://evil.invalid'),'route',d,key,upstream)).status,403);
 assert.equal((await worldMap(req(undefined,{...payload,crs:'GCJ02'}),'route',d,key,upstream)).status,400);
 const r=await (await worldMap(req(),'route',d,key,upstream)).json();assert.equal(r.distance,800);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(r),new RegExp(key));assert.equal(d.sql.prepare('SELECT count(*) n FROM map_cache').get().n,0);d.sql.close();
});
test('托管环境禁用默认缓存时使用命名缓存；打开失败可降级',async()=>{
 const cache={match:async()=>undefined},storage={get default(){throw Error('Default cache disabled in namespaced workers');},async open(name){assert.equal(name,'location-relay-world-tiles-v1');return cache;}};
 assert.equal(await openWorldTileCache(storage),cache);
 assert.equal(await openWorldTileCache({open:async()=>{throw Error('unavailable');}}),undefined);
});
test('缓存读取或写入失败仍返回有效底图，并继续执行额度限制',async()=>{
 for(const broken of ['read','write','absent']){
  const d=database();let calls=0;
  const cache=broken==='absent'?undefined:{async match(){if(broken==='read')throw Error('cache disabled');},async put(){throw Error('cache write failed');}};
  const upstream=async()=>{calls++;return new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});};
  const r=await worldMap(request('tile/4/12/7'),'tile/4/12/7',d,key,upstream,cache,now);
  assert.equal(r.status,200);assert.equal(r.headers.get('X-Map-Cache'),'BYPASS');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[137,80,78,71]);assert.equal(calls,1);
  d.sql.exec('UPDATE map_usage SET daily_count=2000');
  const limited=await worldMap(request('tile/4/12/7'),'tile/4/12/7',d,key,upstream,cache,now);assert.equal(limited.status,429);assert.equal(calls,1);d.sql.close();
 }
});
test('瓦片首次访问写入缓存，再次访问不消耗地图额度',async()=>{
 const d=database(),entries=new Map();let calls=0;
 const cache={async match(r){return entries.get(r.url)?.clone();},async put(r,v){entries.set(r.url,v);}};
 const upstream=async()=>{calls++;return new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});};
 const cold=await worldMap(request('tile/4/12/7'),'tile/4/12/7',d,key,upstream,cache,now),hot=await worldMap(request('tile/4/12/7'),'tile/4/12/7',d,key,upstream,cache,now);
 assert.equal(cold.headers.get('X-Map-Cache'),'MISS');assert.equal(hot.headers.get('X-Map-Cache'),'HIT');assert.equal(calls,1);assert.equal(d.sql.prepare('SELECT daily_count FROM map_usage').get().daily_count,1);d.sql.close();
});
test('预算数据库失败关闭上游请求，明确服务器异常而非用户网络',async()=>{
 let calls=0;const d={prepare(){throw Error('database failed '+key);}};
 const r=await worldMap(request('tile/4/12/7'),'tile/4/12/7',d,key,async()=>{calls++;},undefined,now),body=await r.json();
 assert.equal(body.code,'SERVER');assert.doesNotMatch(JSON.stringify(body),new RegExp(key+'|检查网络'));assert.equal(calls,0);
});
test('高清资源限定主机、层级、字体和范围，不能代理外部URL',()=>{
 for(const path of ['vector/15/0/0','vector/14/16384/0','fonts/evil/0-255.pbf','fonts/Noto Sans Regular/1-256.pbf','fonts/Noto Sans Regular/65536-65791.pbf','sprite/../../evil','https://evil.invalid'])assert.equal(worldResource(path),null);
 const p=worldResource('vector/14/12770/7552');assert.equal(p.url.host,'maps.geoapify.com');assert.equal(p.type,'application/x-protobuf');
 assert.match(worldResource('tile-hd/17/102163/60418').url.href,/@2x\.png$/);
 assert.equal(worldResource('fonts/Noto Sans Regular/3584-3839.pbf').type,'application/x-protobuf');
});
test('矢量、字体、图标走缓存和原有预算；错误格式不能当成地图',async()=>{
 const d=database();let calls=0;const entries=new Map(),cache={async match(r){return entries.get(r.url)?.clone();},async put(r,v){entries.set(r.url,v);}};
 for(const path of ['vector/14/12770/7552','fonts/Noto Sans Regular/3584-3839.pbf','sprite.json','sprite@2x.png','tile-hd/17/102163/60418']){
  const type=worldResource(path).type;
  const upstream=async url=>{calls++;assert.equal(new URL(url).searchParams.get('apiKey'),key);return new Response(type==='application/json'?'{}':new Uint8Array([1,2,3]),{headers:{'content-type':type}});};
  const a=await worldMap(request(path),path,d,key,upstream,cache,now),b=await worldMap(request(path),path,d,key,upstream,cache,now);
  assert.equal(a.status,200);assert.equal(a.headers.get('content-type'),type);assert.equal(b.headers.get('X-Map-Cache'),'HIT');
 }
 assert.equal(calls,5);assert.equal(d.sql.prepare('SELECT daily_count FROM map_usage').get().daily_count,5);
 const bad=await worldMap(request('vector/1/0/0'),'vector/1/0/0',d,key,async()=>Response.json({apiKey:key}),cache,now);assert.equal(bad.status,502);assert.doesNotMatch(await bad.text(),new RegExp(key));d.sql.close();
});
test('矢量图名使用中文和原名，保留路牌编号，不含Key或外部资源请求',()=>{
 const style=worldStyle('https://test.invalid');
 assert.equal(style.sources.default.maxzoom,14);assert.equal(style.sources.default.url,undefined);
 assert.equal(style.sources.default.tiles[0],'https://test.invalid/api/world-map/vector/{z}/{x}/{y}');
 assert.match(style.glyphs,/^https:\/\/test.invalid\/api\/world-map\/fonts/);assert.equal(style.sprite,'https://test.invalid/api/map-assets/v3/sprite');
 assert.doesNotMatch(JSON.stringify(style),/apiKey|KEY_PLACEHOLDER|maps.geoapify.com/);
 const names=style.layers.filter(l=>l.type==='symbol'&&JSON.stringify(l.layout?.['text-field']??null).includes('name:zh'));assert.ok(names.length>10);assert.deepEqual(names[0].layout['text-field'],labelExpression(names[0]['source-layer']));
 assert.ok(style.layers.some(l=>JSON.stringify(l.layout?.['text-field']??null).includes('ref')));
});
test('双语名称优先原有中文，补充参考译名且保留原名',()=>{
 const compiled=createExpression(bilingualName,"layers[0].layout.text-field");assert.equal(compiled.result,'success');
 const evaluate=properties=>compiled.value.evaluate({zoom:14},{type:1,properties});
 assert.equal(evaluate({'name:zh':'廊曼機場',name:'ท่าอากาศยานดอนเมือง'}),'廊曼機場\nท่าอากาศยานดอนเมือง');
 assert.equal(evaluate({'name:zh':'廊曼機場',name:'廊曼機場'}),'廊曼機場');
 assert.equal(evaluate({name:'Krispy Kreme','name:latin':'Krispy Kreme'}),'克里斯皮奶油甜甜圈†\nKrispy Kreme');
 assert.equal(evaluate({'name:zh':'','name:zh-Hans':'测试店',name:'Test'}),'测试店\nTest');
 assert.equal(evaluate({name:'Subway',class:'fast_food'}),'赛百味\nSubway');
 assert.equal(evaluate({name:'Subway',class:'railway'}),'铁路车站\nSubway');
 assert.equal(evaluate({name:'Mapas',class:'shop'}),'商铺\nMapas');
 assert.equal(evaluate({name:'BNE',class:'shop',subclass:'jewelry'}),'珠宝店\nBNE');
 assert.equal(evaluate({name:'Adidas',class:'shop'}),'阿迪达斯\nAdidas');
 assert.equal(evaluate({name:'ถนนเชิดวุฒากาศ','name:en':'Choet Wutthakat Rd.'}),'乔特武他卡路†\nChoet Wutthakat Rd.');
 assert.equal(evaluate({name:'ชื่อทดสอบ','name:latin':'Test'}),'Test\nชื่อทดสอบ');
});

test('数据含未知POI类别时只选择已有图标，不向绘图引擎请求不存在的图片',()=>{
 const layer=worldStyle('https://test.invalid').layers.find(x=>x.id==='poi-level-1');
 const parsed=createExpression(layer.layout['icon-image'],'layers[0].layout.icon-image');assert.equal(parsed.result,'success');
 assert.equal(parsed.value.evaluate({zoom:16},{type:1,properties:{class:'toilets'}}),'circle_11');
 assert.equal(parsed.value.evaluate({zoom:16},{type:1,properties:{class:'cafe'}}),'cafe_11');
});

test('新中文显示名不改变相对位置、粗精度处理或原始地址',()=>{
 const raw={results:[{...nearby.results[0],name:'Krispy Kreme'}]},point=p(13.75,100.5);
 const result=worldPlace(raw,point,17);assert.match(result.title,/克里斯皮奶油甜甜圈† · Krispy Kreme附近/);assert.match(result.relative,/东侧约40米/);assert.equal(result.address,'Test building, Bangkok');
 assert.doesNotMatch(worldPlace(raw,point,300).title,/Krispy/);
});
