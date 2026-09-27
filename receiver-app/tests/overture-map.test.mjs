import test from 'node:test';
import assert from 'node:assert/strict';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import vtpbf from 'vt-pbf';
import {overtureMap as serve,overturePlaceProperties,compactOvertureTile,OVERTURE_RELEASE,overtureRelease} from '../lib/overture-map.ts';
const overtureMap=(req,path,cache,reader)=>serve(req,path,cache,reader,async()=>OVERTURE_RELEASE);
const point=(props,x=100,y=200)=>({type:1,id:7,properties:props,loadGeometry:()=>[[{x,y}]]});
const props={names:JSON.stringify({primary:'Test Hotel',common:{zh:'测试酒店',en:'Test Hotel'}}),confidence:.95,basic_category:'hotel',phones:'private test field',id:'place-1'};
function tile(name,features){const b=vtpbf.fromVectorTileJs({layers:{[name]:{name,extent:4096,length:features.length,feature:i=>features[i]}}});return new Uint8Array(b).buffer;}
const decode=(data,name)=>new VectorTile(new Pbf(new Uint8Array(data))).layers[name];
test('Only credible open places survive; original multilingual names and coordinates preserved',()=>{
 const raw=tile('place',[point(props),point({...props,confidence:.4}),point({...props,operating_status:'closed'})]);
 const result=compactOvertureTile(raw,'places'),l=decode(result,'place');assert.equal(l.length,1);
 const f=l.feature(0);assert.equal(f.properties['name:zh'],'测试酒店');assert.equal(f.properties.name,'Test Hotel');assert.equal(f.properties.rank,1);assert.equal(f.properties.phones,undefined);assert.equal(f.loadGeometry()[0][0].x,100);assert.equal(f.loadGeometry()[0][0].y,200);
 assert.equal(overturePlaceProperties({...props,names:'broken','@name':''}),null);assert.equal(overturePlaceProperties({...props,confidence:null}),null);
});
test('Footprints preserve polygon geometry; omit underground and oversized metadata',()=>{
 const f={type:3,properties:{id:'building-a',sources:'lots of metadata'},loadGeometry:()=>[[{x:1,y:2},{x:4,y:2},{x:4,y:5},{x:1,y:2}]]};
 const raw=tile('building',[f,{...f,properties:{is_underground:true}}]);const a=decode(raw,'building'),b=decode(compactOvertureTile(raw,'buildings'),'building');assert.equal(b.length,1);assert.deepEqual(b.feature(0).loadGeometry(),a.feature(0).loadGeometry());assert.deepEqual(b.feature(0).properties,{});
});
const req=p=>new Request('https://example.test/api/world-map/'+p),path='overture/places/14/12769/7552';
test('Only bounded fixed tiles accepted; no arbitrary host, zoom, or query proxy',async()=>{
 let calls=0;const read=async()=>{calls++;return tile('place',[point(props)]);};
 for(const p of ['overture/evil/14/1/2','overture/places/13/1/2','overture/places/14/16384/0','overture/places/14/-1/0','overture/places/14/1/2?url=https://evil.test'])assert.equal((await overtureMap(req(p),p.split('?')[0],undefined,read)).status,400);
 assert.equal((await overtureMap(new Request(req(path),{method:'POST'}),path,undefined,read)).status,405);assert.equal(calls,0);
});
test('Same tile cached and concurrent requests coalesced, no API key or paid quota needed',async()=>{
 const entries=new Map(),cache={match:async r=>entries.get(r.url)?.clone(),put:async(r,v)=>{entries.set(r.url,v);}};
 let calls=0;const read=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return tile('place',[point(props)]);};
 const rs=await Promise.all([overtureMap(req(path),path,cache,read),overtureMap(req(path),path,cache,read)]);
 assert.equal(calls,1);assert.ok(rs.every(r=>r.status===200));assert.equal(rs[0].headers.get('X-Overture-Release'),OVERTURE_RELEASE);
 const hit=await overtureMap(req(path),path,cache,read);assert.equal(hit.status,200);assert.equal(calls,1);assert.doesNotThrow(()=>hit.headers.set('framework','ok'));
});
test('No-data tiles are valid empty protobuf; errors not cached and retry succeeds',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 assert.equal((await overtureMap(req(path),path,undefined,async()=>undefined)).status,200);
 const broken={match:async()=>{throw Error('cache');},put:async()=>{throw Error('cache');}};
 const failed=await overtureMap(req(path),path,broken,async()=>{throw Error('network');});assert.equal(failed.status,502);assert.equal(failed.headers.get('Cache-Control'),'no-store');
 assert.equal((await overtureMap(req(path),path,broken,async()=>tile('place',[point(props)]))).status,503);t.mock.timers.tick(10001);
 const retry=await overtureMap(req(path),path,broken,async()=>tile('place',[point(props)]));assert.equal(retry.status,200);
});

test('Release discovery accepts only official dated catalogs and reuses one hourly result',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const bad=await overtureRelease(async()=>Response.json({links:[{rel:'child',latest:true,href:'https://evil.invalid/2026-09-23.1/catalog.json'}]}));assert.equal(bad,OVERTURE_RELEASE);t.mock.timers.tick(60001);
 let count=0;const fetcher=async(url,opts)=>{count++;assert.equal(url,'https://stac.overturemaps.org/catalog.json');assert.match(opts.headers['User-Agent'],/LocationRelay/);return Response.json({links:[{rel:'child',latest:true,href:'https://stac.overturemaps.org/2026-09-23.1/catalog.json'}]});};
 assert.equal(await overtureRelease(fetcher),OVERTURE_RELEASE);assert.equal(await overtureRelease(fetcher),OVERTURE_RELEASE);assert.equal(count,1);
});

test('Overture taxonomy and region-specific Chinese name keys join bilingual display',()=>{
 const d=overturePlaceProperties({...props,names:JSON.stringify({primary:'Smile Theory Dental Clinic',common:{'zh-CN':'微笑理论牙科诊所'}}),basic_category:'dental_clinic'});assert.equal(d.class,'dentist');assert.equal(d['name:zh'],'微笑理论牙科诊所');
 const fallback=overturePlaceProperties({...props,basic_category:'new_unmapped_subcategory',taxonomy:JSON.stringify({hierarchy:['food_and_drink','restaurant']})});assert.equal(fallback.class,'restaurant');
});
