import {PMTiles,SharedPromiseCache,type Source} from 'pmtiles';
import {VectorTile,type VectorTileFeature} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import vtpbf from 'vt-pbf';

// Known-good fallback; runtime refreshes the official release catalog (hourly).
export const OVERTURE_RELEASE='2026-09-23.1';
const VERSION='v2',MAX_BYTES=8*1024*1024;
export const overtureAttribution='© <a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noopener noreferrer">Overture Maps</a>';
type Theme='buildings'|'places';
type Props=Record<string,unknown>;
const categories:Record<string,string>={
 dental_clinic:'dentist',vehicle_service:'car_repair',laundry_service:'laundry',pharmacy_and_drug_store:'pharmacy',
 personal_care_and_beauty_store:'beauty',gas_station:'fuel',fueling_station:'fuel',government_office:'town_hall',
 elementary_school:'school',place_of_learning:'school',education:'school',preschool:'kindergarten',
 fast_food_restaurant:'fast_food',resort:'hotel',gym:'fitness',fitness_studio:'fitness',police_station:'police',
 buddhist_place_of_worship:'buddhist',hindu_place_of_worship:'place_of_worship',community_center:'community',
 animal_and_pet_store:'pet',sporting_goods_store:'sports',corporate_or_business_office:'office',medical_service:'clinic',
 pediatric_clinic:'clinic',department_store:'shop',flowers_and_gifts_store:'florist',parking:'parking',
 travel_service:'travel_agency',financial_service:'bank',media_service:'office',social_or_community_service:'community',
 restaurant:'restaurant',casual_eatery:'restaurant',coffee_shop:'cafe',cafe:'cafe',bar:'bar',bakery:'bakery',
 lodging:'lodging',hotel:'hotel',motel:'hotel',hostel:'hostel',convenience_store:'convenience',supermarket:'supermarket',
 grocery_store:'supermarket',food_and_beverage_store:'shop',shopping:'shop',fashion_and_apparel_store:'clothes',
 pharmacy:'pharmacy',hospital:'hospital',medical_center:'clinic',dentist:'dentist',bank:'bank',atm:'atm',
 school:'school',university:'university',college:'college',kindergarten:'kindergarten',airport:'airport',
 train_station:'station',bus_station:'bus',park:'park',museum:'museum',religious_organization:'place_of_worship',
 automotive_service:'car_repair',personal_or_beauty_service:'beauty',hardware_home_and_garden_store:'hardware',
 professional_service:'office',home_service:'office',wellness_service:'fitness',real_estate_service:'office',
 animal_or_pet_service:'pet',vehicle_parts_store:'car_parts',electronics_store:'electronics',manufacturer:'industrial',historic_site:'place',
};
function parsed(v:unknown):Props{if(typeof v==='object'&&v!==null)return v as Props;if(typeof v!=='string'||v.length>20000)return {};try{const p=JSON.parse(v);return p&&typeof p==='object'?p:{};}catch{return {};}}
function str(v:unknown):string{return typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,180):'';}
export function overturePlaceProperties(p:Props):Props|null{
 const confidence=Number(p.confidence);
 if(!Number.isFinite(confidence)||confidence<.8||['closed','permanently_closed'].includes(String(p.operating_status)))return null;
 const names=parsed(p.names),common=parsed(names.common),name=str(names.primary)||str(p['@name']);if(!name)return null;
 const taxonomy=parsed(p.taxonomy),hierarchy=Array.isArray(taxonomy.hierarchy)?taxonomy.hierarchy:[];
 const category=[p.basic_category,taxonomy.primary,...hierarchy.slice().reverse()].map(v=>categories[str(v)]).find(Boolean)||'place';
 const icon=({hotel:'lodging',hostel:'lodging',supermarket:'grocery',convenience:'grocery',clinic:'hospital',clothes:'clothing_store',car_repair:'car',car_parts:'car'} as Record<string,string>)[category]||category;
 const essential=['hospital','pharmacy','school','university','airport','station','bank','supermarket','hotel','park'].includes(category);
 return {id:str(p.id),name,'name:zh':str(common['zh-Hans'])||str(common.zh)||str(common['zh-Hant'])||str(common['zh-CN'])||str(common.zh_CN)||str(common['zh-TW']),
  'name:en':str(common.en),class:category,icon,confidence,rank:essential?1:confidence>=.95?2:3};
}
// Return only display fields. Business phone numbers, websites and provenance JSON
// are not needed by the browser. Keep geometries exactly as supplied by Overture.
export function compactOvertureTile(data:ArrayBuffer,theme:Theme):Uint8Array{
 const tile=new VectorTile(new Pbf(new Uint8Array(data))),name=theme==='buildings'?'building':'place',layer=tile.layers[name];
 if(!layer)return new Uint8Array();if(layer.length>60000)throw Error('Tile too dense');
 const features:VectorTileFeature[]=[];
 for(let i=0;i<layer.length;i++){
  const f=layer.feature(i),properties=theme==='places'?overturePlaceProperties(f.properties):f.properties.is_underground===true?null:{};
  if(!properties||(theme==='places'?f.type!==1:f.type!==3))continue;
  f.properties=properties as typeof f.properties;features.push(f);
 }
 return vtpbf.fromVectorTileJs({layers:{[name]:{name,version:2,extent:layer.extent,length:features.length,feature:(i:number)=>features[i]}}});
}
const directoryCache=new SharedPromiseCache(48);
const archives=new Map<string,PMTiles>();
let releaseState:{value:string;until:number}|undefined,releasePending:Promise<string>|undefined;
export async function overtureRelease(fetcher:typeof fetch=fetch):Promise<string>{
 if(releaseState&&Date.now()<releaseState.until)return releaseState.value;
 if(releasePending)return releasePending;
 releasePending=discoverRelease(fetcher);try{return await releasePending;}finally{releasePending=undefined;}
}
async function discoverRelease(fetcher:typeof fetch):Promise<string>{
 try{
  const response=await fetcher('https://stac.overturemaps.org/catalog.json',{headers:{'User-Agent':'LocationRelay/1.0 (Overture map tiles)'},signal:AbortSignal.timeout(5000),redirect:'manual'});
  if(!response.ok)throw Error('Catalog unavailable');
  const catalog=await response.json() as {links?:{rel?:string;latest?:boolean;href?:string}[]};
  const href=catalog.links?.find(l=>l.rel==='child'&&l.latest===true)?.href||'';
  const match=/^https:\/\/stac\.overturemaps\.org\/(\d{4}-\d{2}-\d{2}\.\d+)\/catalog\.json$/.exec(href);
  if(!match)throw Error('Invalid catalog');
  releaseState={value:match[1],until:Date.now()+3600000};return releaseState.value;
 }catch{releaseState={value:releaseState?.value||OVERTURE_RELEASE,until:Date.now()+60000};return releaseState.value;}
}
function archive(theme:Theme,release:string){
 const key=release+'/'+theme;let reader=archives.get(key);if(reader)return reader;
 const url=`https://tiles.overturemaps.org/${release}/${theme}.pmtiles`;
 const source:Source={getKey:()=>url,async getBytes(offset,length,signal){
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<1||length>MAX_BYTES)throw Error('Invalid range');
  const response=await fetch(url,{headers:{'User-Agent':'LocationRelay/1.0 (Overture map tiles)',Range:`bytes=${offset}-${offset+length-1}`},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),redirect:'manual'});
  if(response.status!==206||!response.headers.get('content-range')?.startsWith(`bytes ${offset}-`))throw Error('Range unavailable: '+response.status);
  const data=await response.arrayBuffer();if(data.byteLength!==length)throw Error('Incomplete range');return {data,etag:response.headers.get('etag')||undefined};
 }};
 reader=new PMTiles(source,directoryCache);if(archives.size>=4)archives.clear();archives.set(key,reader);return reader;
}
const active=new Map<string,Promise<Uint8Array>>();
const failures=new Map<string,number>();
export async function overtureMap(req:Request,path:string,cache?:Cache,readTile=async(theme:Theme,z:number,x:number,y:number,release:string)=>{const tile=await archive(theme,release).getZxy(z,x,y);return tile?.data;},resolveRelease:()=>Promise<string>=overtureRelease){
 const match=/^overture\/(?:v2\/)?(buildings|places)\/14\/(\d{1,5})\/(\d{1,5})$/.exec(path),input=new URL(req.url);
 if(req.method!=='GET')return new Response(null,{status:405});
 if(!match||+match[2]>=16384||+match[3]>=16384||input.search||req.headers.get('sec-fetch-site')==='cross-site')return new Response(null,{status:400});
 const theme=match[1] as Theme,x=+match[2],y=+match[3];
 const recentKey=new Request(`${input.origin}/api/world-map/overture-recent/${VERSION}/${theme}/${x}/${y}`);
 try{const hit=await cache?.match(recentKey);if(hit){const headers=new Headers(hit.headers);headers.set('X-Map-Cache','HIT');return new Response(hit.body,{headers});}}catch{}
 const release=await resolveRelease();
 const key=new Request(`${input.origin}/api/world-map/overture-cache/${release}/${VERSION}/${theme}/${x}/${y}`);
 try{const hit=await cache?.match(key);if(hit)return new Response(hit.body,{headers:new Headers(hit.headers)});}catch{/* Cache outage must not hide the map. */}
 if((failures.get(key.url)||0)>Date.now())return new Response(null,{status:503,headers:{'Retry-After':'10','Cache-Control':'no-store'}});
 const headers={'Content-Type':'application/x-protobuf','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','X-Overture-Release':release,'X-Map-Cache':'MISS'};
 try{
  let pending=active.get(key.url);
  if(!pending){
   if(active.size>=16)return new Response(null,{status:503,headers:{'Retry-After':'2','Cache-Control':'no-store'}});
   pending=(async()=>{const data=await readTile(theme,14,x,y,release);if(data&&data.byteLength>MAX_BYTES)throw Error('Tile too large');return data?compactOvertureTile(data,theme):new Uint8Array();})();active.set(key.url,pending);
  }
  const bytes=await pending;
  const result=new Response(new Uint8Array(bytes),{headers});
  try{await cache?.put(key,result.clone());if(cache){const recent=new Response(result.clone().body,{headers:new Headers(result.headers)});recent.headers.set('Cache-Control','public, max-age=3600');await cache.put(recentKey,recent);}}catch{/* Optional shared cache. */}
  return result;
 }catch(e){if(failures.size>128)failures.clear();failures.set(key.url,Date.now()+10000);console.warn('overture:tile-unavailable',e instanceof Error?e.name+': '+e.message.slice(0,140):'unknown');return new Response(null,{status:502,headers:{'Cache-Control':'no-store'}});}
 finally{active.delete(key.url);}
}
