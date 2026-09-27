// Warm a bounded set of tiles along the approach. These use the existing same-origin
// cache and budget; never prefetch the whole country or write location records.
export function approachTiles(lon:number,lat:number):string[]{
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)return [];
 const paths:string[]=[];
 for(const z of [8,10,12,14]){
  const n=2**z,x=(lon+180)/360*n,y=(1-Math.asinh(Math.tan(Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180))/Math.PI)/2*n;
  // At close zoom, the viewport may straddle a tile edge. A small margin covers
  // the destination without downloading a large surrounding area.
  const margin=z===14?.2:0;
  for(let a=Math.floor(x-margin);a<=Math.floor(x+margin);a++)for(let b=Math.floor(y-margin);b<=Math.floor(y+margin);b++){
   if(b>=0&&b<n)paths.push(`/api/world-map/vector/${z}/${((a%n)+n)%n}/${b}`);
  }
 }
 return Array.from(new Set(paths));
}
export async function warmApproach(lon:number,lat:number,signal:AbortSignal,load?:(path:string,signal:AbortSignal)=>Promise<unknown>):Promise<void>{
 const queue=approachTiles(lon,lat),controller=new AbortController(),combined=controller.signal;
 // Warm only the destination detail tile concurrently; never delay the one-second
 // camera transition while extra footprints/places arrive.
 const n=16384,x=Math.min(n-1,Math.floor((lon+180)/360*n)),y=Math.min(n-1,Math.max(0,Math.floor((1-Math.asinh(Math.tan(Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180))/Math.PI)/2*n)));
 if(queue.length&&!signal.aborted)for(const theme of ['buildings','places'])void (load?load(`/api/world-map/overture/v2/${theme}/14/${x}/${y}`,signal):fetch(`/api/world-map/overture/v2/${theme}/14/${x}/${y}`,{signal,cache:'force-cache'}).then(async r=>{if(r.ok)await r.arrayBuffer();else await r.body?.cancel();})).catch(()=>{});
 const abort=()=>controller.abort(),timer=setTimeout(abort,6000);
 signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 try{await Promise.all(Array.from({length:3},async()=>{
  while(queue.length&&!combined.aborted){const path=queue.shift()!;
   try{if(load){await load(path,combined);continue;}const r=await fetch(path,{signal:combined,cache:'force-cache'});if(r.ok)await r.arrayBuffer();else await r.body?.cancel();}catch{/* The normal map request reports service failures. */}
  }
 }));}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
