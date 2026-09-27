// Public basemap bytes only. Never cache location records, routes, keys or geocodes.
// MapLibre requests the same canonical tile again at each overzoom; share one fetch
// and keep a bounded copy because worker transfers detach their ArrayBuffers.
export class WorldTileLoader {
 private entries=new Map<string,{data:ArrayBuffer;until:number}>();
 private pending=new Map<string,Promise<ArrayBuffer>>();
 private jobs:{url:string;priority:number;resolve:(data:ArrayBuffer)=>void;reject:(e:unknown)=>void}[]=[];
 private controllers=new Set<AbortController>();
 private bytes=0;private disposed=false;
 private fetcher:typeof fetch;private maxBytes:number;
 constructor(fetcher:typeof fetch=fetch,maxBytes=24*1024*1024){this.fetcher=fetcher;this.maxBytes=maxBytes;}
 has(url:string){return this.pending.has(url)||!!this.entries.get(url)&&this.entries.get(url)!.until>Date.now();}
 async get(url:string,signal?:AbortSignal,background=false):Promise<ArrayBuffer>{
  if(this.disposed||signal?.aborted)throw new DOMException('Aborted','AbortError');
  const hit=this.entries.get(url);
  if(hit&&hit.until>Date.now()){this.entries.delete(url);this.entries.set(url,hit);return hit.data.slice(0);}
  if(hit){this.bytes-=hit.data.byteLength;this.entries.delete(url);}
  let promise=this.pending.get(url);
  if(!promise){
   promise=new Promise<ArrayBuffer>((resolve,reject)=>{this.jobs.push({url,priority:background?2:url.includes('/overture/')?1:0,resolve,reject});});
   this.pending.set(url,promise);this.pump();
  }else if(!background){const job=this.jobs.find(j=>j.url===url);if(job)job.priority=url.includes('/overture/')?1:0;}
  // Cancelling one overzoom consumer must not abort another or discard a useful tile.
  return new Promise((resolve,reject)=>{
   const cancel=()=>reject(new DOMException('Aborted','AbortError'));
   signal?.addEventListener('abort',cancel,{once:true});
   promise!.then(data=>{signal?.removeEventListener('abort',cancel);if(signal?.aborted)cancel();else resolve(data.slice(0));},e=>{signal?.removeEventListener('abort',cancel);reject(e);});
  });
 }
 cancelWarmup(){
  const stale=this.jobs.filter(j=>j.priority===2);this.jobs=this.jobs.filter(j=>j.priority!==2);
  for(const j of stale){this.pending.delete(j.url);j.reject(new DOMException('Aborted','AbortError'));}
 }
 private pump(){
  this.jobs.sort((a,b)=>a.priority-b.priority);
  while(!this.disposed&&this.jobs.length&&this.controllers.size<6){
   // Leave connections available for visible streets when warming neighboring tiles.
   if(this.jobs[0].priority===2&&this.controllers.size>=2)return;
   const job=this.jobs.shift()!,controller=new AbortController();this.controllers.add(controller);
   const timer=setTimeout(()=>controller.abort(),15000);
   void (async()=>{
    try{
     const request=this.fetcher;
     const response=await request(job.url,{signal:controller.signal,cache:'force-cache'});
     if(!response.ok)throw Object.assign(Error('Map tile unavailable'),{status:response.status});
     const data=await response.arrayBuffer();
     if(this.disposed)throw new DOMException('Aborted','AbortError');
     if(data.byteLength<=this.maxBytes){
      this.entries.set(job.url,{data,until:Date.now()+86400000});this.bytes+=data.byteLength;
      while(this.bytes>this.maxBytes||this.entries.size>160){const key=this.entries.keys().next().value!,old=this.entries.get(key)!;this.bytes-=old.data.byteLength;this.entries.delete(key);}
     }
     job.resolve(data);
    }catch(e){job.reject(e);}finally{clearTimeout(timer);this.controllers.delete(controller);this.pending.delete(job.url);this.pump();}
   })();
  }
 }
 destroy(){this.disposed=true;for(const c of this.controllers)c.abort();for(const j of this.jobs)j.reject(new DOMException('Aborted','AbortError'));this.jobs=[];this.entries.clear();this.bytes=0;}
}

// Warm just one ring around the visible base map, plus its parent zoom. This makes
// a small pan/zoom-out hit existing bytes without downloading a city or country.
export function nearbyTilePaths(west:number,south:number,east:number,north:number,zoom:number):string[]{
 if(![west,south,east,north,zoom].every(Number.isFinite)||west>east||east-west>180)return [];
 const z=Math.max(0,Math.min(14,Math.floor(zoom))),n=2**z;
 const tx=(lon:number)=>Math.floor((lon+180)/360*n),ty=(lat:number)=>Math.floor((1-Math.asinh(Math.tan(Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180))/Math.PI)/2*n);
 const x1=tx(west),x2=tx(east),y1=ty(north),y2=ty(south),cx=Math.floor((x1+x2)/2),cy=Math.floor((y1+y2)/2);
 const candidates:{x:number;y:number;d:number}[]=[];
 for(let x=x1-1;x<=x2+1&&x<=x1+12;x++)for(let y=y1-1;y<=y2+1&&y<=y1+12;y++)if(y>=0&&y<n)candidates.push({x:((x%n)+n)%n,y,d:Math.abs(x-cx)+Math.abs(y-cy)});
 candidates.sort((a,b)=>a.d-b.d);const paths=new Set<string>();
 // Parent tiles first: retained by MapLibre while sharper children arrive.
 if(z>0)for(const p of candidates.slice(0,9))paths.add(`/api/world-map/vector/${z-1}/${Math.floor(p.x/2)}/${Math.floor(p.y/2)}`);
 for(const p of candidates.slice(0,9))paths.add(`/api/world-map/vector/${z}/${p.x}/${p.y}`);
 return [...paths].slice(0,13);
}
