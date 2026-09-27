import {env} from 'cloudflare:workers';
import {db} from '../../../../lib/relay-server';
import {worldMap} from '../../../../lib/world-map-server';
import {openWorldTileCache} from '../../../../lib/world-map-cache';
export const dynamic='force-dynamic';
async function handle(req:Request,{params}:{params:Promise<{path:string[]}>}){
 const path=(await params).path.join('/'),key=(env as unknown as Record<string,string|undefined>).GEOAPIFY_API_KEY||'';
 try{return await worldMap(req,path,db(),key,fetch,!['config','place','route'].includes(path)?await openWorldTileCache(caches):undefined);}
 catch{console.error('world-map:handler-failed');return Response.json({code:'SERVER',error:'地图服务器暂时异常，位置记录已保留，请稍后重试'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const GET=handle;
export const POST=handle;
