import test from 'node:test';import assert from 'node:assert/strict';
import {approachTiles,warmApproach} from '../lib/world-map-prefetch.ts';
test('大范围进场只预取有限瓦片，支持日期变更线及极区，不接受无效坐标',()=>{
 for(const [lon,lat] of [[100.5,13.75],[-180,0],[180,0],[0,90],[0,-90]]){
  const urls=approachTiles(lon,lat);assert.ok(urls.length<=7);assert.equal(urls.length,new Set(urls).size);
  for(const url of urls){const m=/^\/api\/world-map\/vector\/(\d+)\/(\d+)\/(\d+)$/.exec(url);assert.ok(m);const [,z,x,y]=m.map(Number);assert.ok(z<=14&&x>=0&&x<2**z&&y>=0&&y<2**z);}
 }
 for(const p of [[181,0],[0,91],[NaN,0]])assert.deepEqual(approachTiles(...p),[]);
});
test('离开地图会取消预取，预取失败不会破坏地图本身',async()=>{
 const original=globalThis.fetch,c=new AbortController();let active=0,peak=0,count=0;
 try{
  globalThis.fetch=async(url,options)=>{active++;peak=Math.max(peak,active);count++;assert.equal(options.cache,'force-cache');
   await new Promise(resolve=>{options.signal.addEventListener('abort',resolve,{once:true});setTimeout(()=>c.abort(),10);});active--;throw new Error('cancelled');};
  await warmApproach(100.5,13.75,c.signal);assert.ok(peak<=5&&count<=5);assert.equal(active,0);
  globalThis.fetch=async()=>new Response('quota',{status:429});await assert.doesNotReject(warmApproach(100.49,13.9,new AbortController().signal));
 }finally{globalThis.fetch=original;}
});
