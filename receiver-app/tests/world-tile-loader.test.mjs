import test from 'node:test';import assert from 'node:assert/strict';
import {WorldTileLoader,nearbyTilePaths} from '../lib/world-tile-loader.ts';
test('Concurrent overzoom requests fetch once, cancellation does not discard other consumers, buffers independent',async()=>{
 let calls=0,finish;const loader=new WorldTileLoader(async()=>{calls++;await new Promise(r=>finish=r);return new Response(new Uint8Array([1,2,3]));});
 const c=new AbortController(),a=loader.get('/tile',c.signal),b=loader.get('/tile');c.abort();await assert.rejects(a,{name:'AbortError'});finish();
 const bytes=await b;new Uint8Array(bytes)[0]=99;const cached=await loader.get('/tile');assert.equal(calls,1);assert.deepEqual([...new Uint8Array(cached)],[1,2,3]);
 structuredClone(cached,{transfer:[cached]});assert.equal((await loader.get('/tile')).byteLength,3);loader.destroy();
});
test('Errors are retriable, cache bounded, destroying aborts work',async()=>{
 let calls=0;const loader=new WorldTileLoader(async()=>++calls===1?new Response('',{status:502}):new Response(new Uint8Array([1,2,3])),5);
 await assert.rejects(loader.get('/a'));await loader.get('/a');await loader.get('/b');assert.equal(loader.has('/a'),false);assert.equal(loader.has('/b'),true);
 loader.destroy();await assert.rejects(loader.get('/b'),{name:'AbortError'});
});
test('Neighbor warmup includes parent tiles, bounded near view and valid across edge coordinates',()=>{
 for(const coords of [[100.57,13.91,100.60,13.93,15],[-180,-85,-179,-84,3],[179,0,180,1,14]]){
  const urls=nearbyTilePaths(...coords);assert.ok(urls.length<=13);assert.equal(urls.length,new Set(urls).size);
  assert.ok(urls.some(x=>x.includes('/'+(Math.min(14,Math.floor(coords[4]))-1)+'/')));
  for(const url of urls){const [,z,x,y]=/vector\/(\d+)\/(\d+)\/(\d+)/.exec(url).map(Number);assert.ok(x>=0&&x<2**z&&y>=0&&y<2**z);}
 }
 assert.deepEqual(nearbyTilePaths(NaN,0,1,2,3),[]);
});

test('Browser fetch is invoked without binding the cache instance as its receiver',async()=>{
 const loader=new WorldTileLoader(function(){assert.equal(this,undefined);return Promise.resolve(new Response(new Uint8Array([1])));});assert.equal((await loader.get('/tile')).byteLength,1);loader.destroy();
});
