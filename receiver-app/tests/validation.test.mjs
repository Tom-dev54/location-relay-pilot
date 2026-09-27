import {test} from 'node:test';
import assert from 'node:assert/strict';
import './register-ts.mjs';
const {amap}=await import('../lib/client.ts');
import {requireFresh,submission} from '../lib/relay-validation.ts';
const p={lat:22.631234,lon:110.161234,accuracy:18,crs:'WGS84',timestamp:new Date().toISOString()};
function platform(userAgent){Object.defineProperty(globalThis,'navigator',{value:{userAgent,platform:'',maxTouchPoints:0},configurable:true});}
for(const [ua,prefix] of [['iPhone','iosamap://path?'],['Android','amapuri://route/plan/?']]){
 test(ua+'导航坐标与起点',()=>{platform(ua);const u=new URL(amap(p,'小李 室外').native);assert.ok(u.href.startsWith(prefix));assert.equal(u.searchParams.get('dev'),'1');assert.equal(u.searchParams.get('dlat'),String(p.lat));assert.equal(u.searchParams.get('dlon'),String(p.lon));assert.equal(u.searchParams.get('dname'),'小李 室外');assert.equal(u.searchParams.get('t'),'0');assert.equal(u.searchParams.get('slat'),null);assert.equal(u.searchParams.get('slon'),null);assert.ok(!u.href.includes('+'));});
}
test('换记录时目的地变化且 GCJ02 不二次转换',()=>{platform('Android');const a=new URL(amap(p).native),b=new URL(amap({...p,lat:23.12,lon:111.32,crs:'GCJ02'}).native);assert.notEqual(a.searchParams.get('dlat'),b.searchParams.get('dlat'));assert.equal(b.searchParams.get('dev'),'0');assert.equal(new URL(amap(p).web).searchParams.get('coordinate'),'wgs84');assert.equal(new URL(amap({...p,crs:'GCJ02'}).web).searchParams.get('coordinate'),'gaode');});
test('海外高德入口仍传原始坐标，iPhone和安卓都不写入发送者起点',()=>{for(const ua of ['iPhone','Android']){platform(ua);const u=new URL(amap({...p,lat:13.75,lon:100.5},'Krispy Kreme附近').native);assert.equal(u.searchParams.get('dlat'),'13.75');assert.equal(u.searchParams.get('dlon'),'100.5');assert.equal(u.searchParams.get('dev'),'1');assert.equal(u.searchParams.get('slat'),null);assert.equal(u.searchParams.get('dname'),'Krispy Kreme附近');}});
test('新鲜度边界',()=>{const now=Date.now();requireFresh(now-600000,now);requireFresh(now+60000,now);assert.throws(()=>requireFresh(now-600001,now));assert.throws(()=>requireFresh(now+60001,now));});
test('严格拒绝不可表示数字及未知字段',()=>{const base={token:'a'.repeat(64),submissionId:'test-123456789012345',confirmed:true,position:p};for(const v of [NaN,Infinity,null,undefined,'22.63'])assert.throws(()=>submission({...base,position:{...p,lat:v}}));assert.throws(()=>submission({...base,position:{...p,private:true}}));assert.equal(submission(base).lon,p.lon);});
