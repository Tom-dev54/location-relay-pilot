import data from './data/map-assets-v2.json' with {type:'json'};
import {gunzipSync} from 'node:zlib';
// A versioned, fixed manifest: never fetch a caller-supplied URL or read a local path.
const assets:Record<string,{type:string;body:string}>=data;
const decoded=new Map<string,Uint8Array<ArrayBuffer>>();
export function mapAssetResponse(path:string):Response{
 const name=path.startsWith('v3/')?path.slice(3):'';
 const asset=Object.hasOwn(assets,name)?assets[name]:undefined;
 if(!asset)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
 // Return raw bytes. The hosting runtime negotiates compression; declaring gzip on
 // pre-compressed bytes can cause a second compression pass through the framework.
 let bytes=decoded.get(name);if(!bytes){bytes=Uint8Array.from(gunzipSync(Buffer.from(asset.body,'base64')));decoded.set(name,bytes);}
 return new Response(bytes,{headers:{'Content-Type':asset.type,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
