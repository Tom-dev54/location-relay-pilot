import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapAssetResponse} from '../lib/map-assets-response.ts';
test('固定地图素材返回原始字节由运行环境协商压缩，长期缓存无需地图Key',async()=>{
 for(const file of ['noto-regular-0-255.pbf','noto-regular-7680-7935.pbf','sprite@2x.png','sprite.json']){
  const r=mapAssetResponse('v3/'+file);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Encoding'),null);assert.match(r.headers.get('Cache-Control'),/31536000.*immutable/);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),readFileSync(new URL('../public/map-assets/v1/'+file,import.meta.url)));
 }
});
test('地图素材端点只允许清单内版本和文件，拒绝路径穿越与外部URL',()=>{
 for(const p of ['v1/sprite.json','v2/sprite.json','v3/../sprite.json','v3/toString','v3/__proto__','v3/https://example.com','v3/sprite.json/extra'])assert.equal(mapAssetResponse(p).status,404);
});
