import {mapConfig} from '../../../lib/amap-server';
import {mapProxy} from '../../../lib/amap-proxy';
import {db} from '../../../lib/relay-server';
export const dynamic='force-dynamic';
// Official JS API security proxy. Never accept an arbitrary destination host.
export async function GET(req:Request,{params}:{params:Promise<{path:string[]}>}){
 const {path}=await params,p=path.join('/');const allowed=new Set(['v3/geocode/regeo','v3/assistant/coordinate/convert','v3/direction/driving','v5/direction/driving','v4/map/styles','v3/log/init']);if(!allowed.has(p))return new Response('Unsupported map service',{status:404});
 const cfg=mapConfig();if(!cfg.key||!cfg.security)return new Response('Map is not configured',{status:503});
 try{return await mapProxy(req,p,db(),cfg);}catch{return new Response('Map service temporarily unavailable',{status:503});}
}
