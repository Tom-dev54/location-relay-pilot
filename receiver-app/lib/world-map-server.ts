import {reserveMapRequest} from './map-budget';
import {worldPlace} from './world-place';
import {worldResource} from './world-map-resources';
type Coordinate={lat:number;lon:number};
function point(v:unknown):v is Coordinate{const p=v as Coordinate;return !!p&&typeof p.lat==='number'&&typeof p.lon==='number'&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=85.051129&&Math.abs(p.lon)<=180;}
const errors={NOT_CONFIGURED:'海外地图服务尚未配置，请联系管理者；位置记录已保留',AUTH:'海外地图授权失败，请管理者检查 Key 和服务限制',QUOTA:'海外地图查询已达测试上限，请稍后再试',NETWORK:'服务器暂时无法连接海外地图服务，请稍后重试',SERVER:'地图服务器暂时异常，位置记录已保留，请稍后重试',TIMEOUT:'海外地图服务响应超时，请重试',EMPTY:'此处暂无可用的地点名称，可使用坐标和外部地图核对',NO_ROUTE:'未查询到可驾车通行的路线，请使用外部地图核对',INVALID:'地图查询参数无效',UNSUPPORTED:'该区域或坐标系暂不支持此地图',UPSTREAM:'海外地图服务暂不可用，请稍后再试'};
type Code=keyof typeof errors;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
function fail(code:Code,status=503){return json({code,error:errors[code]},status);}
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function worldMap(req:Request,path:string,database:D1Database,key:string,fetcher:typeof fetch=fetch,cache?:Cache,now=Date.now()){
 if(path==='config'&&req.method==='GET')return json({configured:!!key,provider:'geoapify'});
 const resource=worldResource(path);
 if(!resource&&!['place','route'].includes(path)&&!/^tile\/\d{1,2}\/\d{1,7}\/\d{1,7}$/.test(path))return fail('INVALID',404);
 if((path==='route'&&req.method!=='POST')||(path!=='route'&&req.method!=='GET'))return fail('INVALID',405);
 const input=new URL(req.url);if(input.search.length>500||req.headers.get('sec-fetch-site')==='cross-site')return fail('INVALID',400);
 if(!key)return fail('NOT_CONFIGURED');
 let url:URL,cacheKey='',tileKey:Request|undefined,accuracy=0,target:Coordinate|undefined;
 let stage:'prepare'|'budget'|'upstream'|'decode'|'place-cache'='prepare';
 try{
  if(path==='route'){
   if(req.headers.get('origin')!==input.origin||!req.headers.get('content-type')?.startsWith('application/json'))return fail('INVALID',403);
   const reader=req.body?.getReader();if(!reader)return fail('INVALID',400);let raw='',size=0;const decoder=new TextDecoder();while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2048){await reader.cancel();return fail('INVALID',413);}raw+=decoder.decode(r.value,{stream:true});}raw+=decoder.decode();
   let payload;try{payload=JSON.parse(raw);}catch{return fail('INVALID',400);}
   if(!point(payload.start)||!point(payload.end)||payload.crs!=='WGS84')return fail('INVALID',400);
   // Routing languages differ from reverse geocoding; zh is not supported here.
   // Only geometry/numeric totals are shown, with our own Chinese labels.
   url=new URL('https://api.geoapify.com/v1/routing');url.search=new URLSearchParams({waypoints:`${payload.start.lat},${payload.start.lon}|${payload.end.lat},${payload.end.lon}`,mode:'drive',format:'geojson',units:'metric',lang:'en'}).toString();
  }else if(path==='place'){
   if(!input.searchParams.has('lat')||!input.searchParams.has('lon')||!input.searchParams.has('accuracy'))return fail('INVALID',400);
   target={lat:Number(input.searchParams.get('lat')),lon:Number(input.searchParams.get('lon'))};accuracy=Number(input.searchParams.get('accuracy'));
   if(!point(target)||!Number.isFinite(accuracy)||accuracy<0||accuracy>1e8||input.searchParams.get('crs')!=='WGS84')return fail('INVALID',400);
   url=new URL('https://api.geoapify.com/v1/geocode/reverse');url.search=new URLSearchParams({lat:String(target.lat),lon:String(target.lon),format:'json',lang:'zh',limit:'1',...(accuracy>200?{type:accuracy>2000?'city':'street'}:{})}).toString();
   cacheKey=await hash(`world-place-v2:WGS84:${key}:${url.search}`);
   const hit=await database.prepare('SELECT body FROM map_cache WHERE cache_key = ? AND expires_at > ?').bind(cacheKey,now).first<{body:string}>();if(hit)return json(JSON.parse(hit.body));
  }else{
   if(resource)url=resource.url;
   else{const [,z,x,y]=path.split('/').map(Number);if(z<0||z>19||x<0||y<0||x>=2**z||y>=2**z)return fail('INVALID',400);url=new URL(`https://maps.geoapify.com/v1/tile/osm-bright/${z}/${x}/${y}.png`);}
   tileKey=new Request(`${input.origin}/api/world-map/resource-cache/${await hash(key)}/${path}`);
   try {
    const hit=await cache?.match(tileKey);
    // Cache API responses have immutable headers; the framework adds route headers.
    if(hit){const response=new Response(hit.body,{status:hit.status,headers:new Headers(hit.headers)});response.headers.set('X-Map-Cache','HIT');return response;}
   }catch{console.warn('world-map:cache-read-unavailable');cache=undefined;}
  }
  stage='budget';
  if(!await reserveMapRequest(database,tileKey?'worldTiles':'worldService',now))return fail('QUOTA',429);
  url.searchParams.set('apiKey',key);
  stage='upstream';
  const result=await fetcher(url.toString(),{signal:AbortSignal.timeout(12000),redirect:'manual',headers:{Referer:input.origin+'/'}});
  if(!result.ok)return fail(result.status===401||result.status===403?'AUTH':result.status===429?'QUOTA':'UPSTREAM',result.status===429?429:502);
  if(tileKey){
   const type=resource?.type||'image/png',actual=result.headers.get('content-type')||'';
   if(type==='image/png'?!actual.startsWith('image/'):type==='application/json'?!actual.includes('json'):!/protobuf|octet-stream|mapbox-vector-tile/.test(actual))return fail('UPSTREAM',502);
   const bytes=await result.arrayBuffer();if(bytes.byteLength>(resource?.maxBytes||2000000))return fail('UPSTREAM',502);
   const response=new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','X-Map-Cache':cache?'MISS':'BYPASS'}});
   try{await cache?.put(tileKey,response.clone());}catch{console.warn('world-map:cache-write-unavailable');response.headers.set('X-Map-Cache','BYPASS');}
   return response;
  }
  stage='decode';
  const raw=await result.json();
  if(path==='place'){
   const place=worldPlace(raw,target!,accuracy);if(!place)return fail('EMPTY',404);
   const data={place,provider:'geoapify',crs:'WGS84'},body=JSON.stringify(data);
   stage='place-cache';
   await database.batch([database.prepare('DELETE FROM map_cache WHERE expires_at <= ?').bind(now),database.prepare('INSERT INTO map_cache (cache_key, body, expires_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, expires_at = excluded.expires_at').bind(cacheKey,body,now+7*86400000)]);
   return json(data);
  }
  const feature=(raw as {features?:{geometry?:{type?:string;coordinates?:number[][][]};properties?:{distance?:number;time?:number}}[]}).features?.[0],g=feature?.geometry,p=feature?.properties;
  if(g?.type!=='MultiLineString'||!g.coordinates?.length||!g.coordinates.every(line=>Array.isArray(line)&&line.length>=2&&line.every(c=>Array.isArray(c)&&point({lon:c[0],lat:c[1]})))||!Number.isFinite(p?.distance)||!Number.isFinite(p?.time))return fail('NO_ROUTE',404);
  // Never persist the viewer's origin, route or echoed provider request metadata.
  return json({lines:g.coordinates,distance:p!.distance,time:p!.time});
 }catch(e){
  // Fixed stage labels only: provider exceptions may contain API keys or locations.
  console.error(`world-map:${stage}-failed`);
  return fail(stage==='upstream'?(e instanceof Error&&(e.name==='TimeoutError'||e.name==='AbortError')?'TIMEOUT':'NETWORK'):stage==='decode'?'UPSTREAM':'SERVER');
 }
}
