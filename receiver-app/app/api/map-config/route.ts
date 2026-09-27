import {mapConfig} from '../../../lib/amap-server';
import {json,safe} from '../../../lib/relay-server';
export const dynamic='force-dynamic';
export async function GET(){return safe(async()=>{
 const c=mapConfig();
 if(!c.key||!c.security)return json({configured:false,key:null});
 return json({configured:true,key:c.key});
});}
