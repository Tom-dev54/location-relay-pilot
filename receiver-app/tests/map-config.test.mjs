import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
test('SDK 配置超过旧的 100 次门槛仍可获取，不调用数据库或上游、不返回安全密钥',async()=>{
 const source=fs.readFileSync(new URL('../app/api/map-config/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const stub=`const mapConfig=()=>({key:'public-key',security:'server-secret'});const json=Response.json.bind(Response);const safe=fn=>fn();`;
 const {GET}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(stub+source)).toString('base64'));
 for(let i=0;i<150;i++){const r=await GET();assert.equal(r.status,200);assert.deepEqual(await r.json(),{configured:true,key:'public-key'});}
});
test('页面已有高德 SDK 时不会再次请求配置或加载脚本',async()=>{
 const source=fs.readFileSync(new URL('../lib/amap-browser.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const stub=`const window={AMap:{test:true}};const fetch=()=>{throw Error('unexpected fetch')};`;
 const {loadAMap}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(stub+source)).toString('base64'));
 assert.equal((await loadAMap()).test,true);
});
