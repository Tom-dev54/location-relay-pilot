import test from 'node:test';
import assert from 'node:assert/strict';
import './register-ts.mjs';
const {describePlace}=await import('../lib/place-description.ts');
test('附近建筑描述不认定人在建筑内，方位由建筑指向采集点',()=>{const p=describePlace({formattedAddress:'示例道路',pois:[{name:'示例建筑',location:'110,22'}]},[110.001,22]);assert.equal(p.title,'示例建筑附近');assert.match(p.relative,/东侧约100米/);});
test('没有地图数据时不编造建筑名',()=>{const p=describePlace({formattedAddress:'某道路'},[110,22]);assert.equal(p.title,'某道路');assert.equal(p.relative,'');});
test('支持 SDK 的 LngLat 对象并排除远处地点',()=>{const p=describePlace({pois:[{name:'远方建筑',location:'112,22'},{name:'邻近地点',location:{getLng:()=>110,getLat:()=>22}}]},[110,22.001]);assert.equal(p.title,'邻近地点附近');assert.match(p.relative,/北侧/);});
