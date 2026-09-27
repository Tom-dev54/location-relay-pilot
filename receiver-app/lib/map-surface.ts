import {loadAMap,converted,addressFor,type AMapSDK} from './amap-browser';
import {describePlace,type Place} from './place-description';
import {api} from './client';
import {mapRegion,type MapProvider,type MapPoint} from './map-region';
import {mapMarker,type MarkerPoint} from './map-marker';
import {preloadWorldAssets} from './world-map-assets';
export type Mapped={coordinates?:[number,number];place?:Place;error?:string};
export type BaseState={status:'loading'|'ready'|'error';message:string;visible?:boolean};
export type MapSurface={markers:(points:MarkerPoint[],select:(id:string)=>void)=>void;focus:(p:[number,number],radius:number)=>void;route:(start:MapPoint,end:[number,number])=>Promise<{distance:number;time:number}>;clearRoute:()=>void;destroy:()=>void};
export async function lookupPlace(provider:MapProvider,p:MapPoint):Promise<Mapped>{
 let coordinates:[number,number]|undefined;
 try{
  if(provider==='world'){
   if(p.crs!=='WGS84')throw Error('此旧记录使用高德坐标，请选择高德地图');
   coordinates=[p.lon,p.lat];
   const r=await api<{place:Place}>('/api/world-map/place?'+new URLSearchParams({lat:String(p.lat),lon:String(p.lon),accuracy:String(p.accuracy||0),crs:p.crs}));
   return {coordinates,place:r.place};
  }
  const sdk=await loadAMap();coordinates=await converted(sdk,p);
  return {coordinates,place:describePlace(await addressFor(sdk,coordinates),coordinates,p.accuracy)};
 }catch(e){return {coordinates,error:e instanceof Error?e.message:'地点查询失败，请重试'};}
}
export async function createMapSurface(provider:MapProvider,el:HTMLElement,state:(s:BaseState)=>void,initial?:MapPoint,compatible=false):Promise<MapSurface>{
 state({status:'loading',message:'正在加载地图…'});
 if(provider==='amap'){
  const A=await loadAMap(),map=new A.Map(el,{viewMode:'2D',zoom:4,center:[105,35]});
  let points:AMapSDK[]=[],circle:AMapSDK|null=null,driving:AMapSDK|null=null,dead=false,routeEpoch=0;
  const timer=setTimeout(()=>{if(!dead)state({status:'error',message:'高德底图未确认加载完成，请重新加载或切换地图'});},15000);
  map.on?.('complete',()=>{clearTimeout(timer);if(!dead)state({status:'ready',message:''});});
  map.on?.('error',()=>{if(!dead)state({status:'error',message:'高德底图加载失败，请检查网络或切换地图'});});
  map.addControl(new A.Scale());map.addControl(new A.ToolBar());
  return {
   markers(items,select){if(dead)return;points.forEach(m=>m.setMap(null));points=items.map(p=>{return new A.Marker({position:p.coordinates,title:p.title,content:mapMarker(p,select),anchor:'bottom-center',offset:new A.Pixel(0,0),zIndex:p.selected?300:100,map});});},
   focus(p,radius){if(dead)return;circle?.setMap(null);circle=new A.Circle({center:p,radius:Math.min(radius,20000000),strokeColor:'#1975e8',strokeOpacity:.5,fillColor:'#4a96ff',fillOpacity:.15,map});map.setFitView([circle],false,[45,45,45,45],17);},
   async route(start,end){
    if(mapRegion(start).provider!=='amap')throw Error('起点在大陆以外，请选择海外地图或使用外部导航核对跨境路线');
    const epoch=++routeEpoch,origin=await converted(A,start);if(dead||epoch!==routeEpoch)throw Error('地图已切换');driving?.clear();const d=new A.Driving({map,hideMarkers:false,policy:0});driving=d;
    return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{d.clear();reject(Error('路线查询超时，请重试'));},15000);d.search(origin,end,(status:string,r:{routes?:{distance:number;time:number}[]})=>{clearTimeout(timeout);if(dead||epoch!==routeEpoch){d.clear();reject(Error('位置已切换'));return;}const route=r?.routes?.[0];if(status==='complete'&&route)resolve(route);else{d.clear();reject(Error('未查询到驾车路线，请使用外部导航核对'));}});});
   },
   clearRoute(){routeEpoch++;driving?.clear();driving=null;},
   destroy(){dead=true;routeEpoch++;clearTimeout(timer);driving?.clear();map.destroy();},
  };
 }
 if(!compatible)preloadWorldAssets();
 const [{configured},vector]=await Promise.all([api<{configured:boolean}>('/api/world-map/config'),compatible?Promise.resolve(null):import('./world-vector').catch(()=>null)]);
 if(!configured)throw Error('海外地图服务尚未配置；位置已保存，可先用下方 Google 或苹果地图查看');
 if(vector){try{return await vector.createWorldVector(el,state,initial);}catch{el.replaceChildren();}}
 const L=await import('leaflet');el.dataset.renderer='raster';
 const map=L.map(el,{maxZoom:19,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView(initial?[initial.lat,initial.lon]:[15,100],initial?17:4),layer=L.layerGroup().addTo(map);
 L.control.scale({imperial:false}).addTo(map);let circle:import('leaflet').Circle|undefined,route:import('leaflet').Polyline|undefined,dead=false,visible=false,tileError='',loaded=0,loadTimer:ReturnType<typeof setTimeout>;
 const controllers=new Set<AbortController>();
 const emit=(s:BaseState)=>state({...s,visible});
 function begin(){loaded=0;tileError='';clearTimeout(loadTimer);emit({status:'loading',message:'正在加载海外底图…'});loadTimer=setTimeout(()=>{if(!dead)emit({status:'error',message:tileError||'海外底图加载超时，请重新加载地图'});},16000);}
 const Tiles=L.TileLayer.extend({createTile:function(c:import('leaflet').Coords,done:import('leaflet').DoneCallback){
  const tile=document.createElement('img');tile.alt='';tile.setAttribute('role','presentation');const ctrl=new AbortController();controllers.add(ctrl);const timer=setTimeout(()=>ctrl.abort(),14000);
  void fetch(`/api/world-map/${devicePixelRatio>1?'tile-hd':'tile'}/${c.z}/${c.x}/${c.y}`,{signal:ctrl.signal}).then(async r=>{if(!r.ok){const e=await r.json().catch(()=>({})) as {error?:string};throw Error(e.error||'海外底图加载失败');}const blob=await r.blob();if(dead)return;const url=URL.createObjectURL(blob);tile.onload=()=>{URL.revokeObjectURL(url);done(undefined,tile);};tile.onerror=()=>{URL.revokeObjectURL(url);done(Error('地图图片无法显示'),tile);};tile.src=url;}).catch(e=>{if(!dead){tileError=e.name==='AbortError'?'海外底图加载超时':e.message;done(Error(tileError),tile);}}).finally(()=>{clearTimeout(timer);controllers.delete(ctrl);});return tile;
 }});
 const TileClass=Tiles as unknown as new(url:string,options:import('leaflet').TileLayerOptions)=>import('leaflet').TileLayer;
 const tiles=new TileClass('',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a>'});
 tiles.on('loading',begin);tiles.on('tileload',()=>{loaded++;});tiles.on('tileerror',()=>{if(!dead)emit({status:'error',message:tileError||'部分海外底图加载失败，请重试'});});tiles.on('load',()=>{visible ||= loaded>0;clearTimeout(loadTimer);if(!dead)emit(tileError||!loaded?{status:'error',message:tileError||'海外底图没有加载成功'}:{status:'ready',message:''});});
 begin();tiles.addTo(map);
 let routeEpoch=0;
 return {
  markers(items,select){if(dead)return;layer.clearLayers();for(const p of items){const icon=L.divIcon({html:mapMarker(p,select),className:'relay-marker-wrapper',iconSize:[44,50],iconAnchor:[22,50]});L.marker([p.coordinates[1],p.coordinates[0]],{icon,keyboard:false,zIndexOffset:p.selected?300:0}).addTo(layer);}},
  focus(p,radius){if(dead)return;circle?.remove();const center:L.LatLngExpression=[p[1],p[0]];circle=L.circle(center,{radius:Math.min(radius,20000000),color:'#1975e8',weight:2,fillOpacity:.15}).addTo(map);map.fitBounds(circle.getBounds(),{padding:[45,45],maxZoom:17});},
  async route(start,end){
   if(start.crs!=='WGS84')throw Error('当前位置坐标系不适用于海外地图');
   const epoch=++routeEpoch;route?.remove();route=undefined;
   const data=await api<{lines:[number,number][][];distance:number;time:number}>('/api/world-map/route','POST',{start:{lat:start.lat,lon:start.lon},end:{lat:end[1],lon:end[0]},crs:'WGS84'});
   if(dead||epoch!==routeEpoch)throw Error('位置已切换，请重新查询路线');
   route=L.polyline(data.lines.map(line=>line.map(c=>[c[1],c[0]] as [number,number])),{color:'#1465d9',weight:6}).addTo(map);map.fitBounds(route.getBounds(),{padding:[35,35],maxZoom:17});return data;
  },
  clearRoute(){routeEpoch++;route?.remove();route=undefined;},
  destroy(){dead=true;routeEpoch++;clearTimeout(loadTimer);controllers.forEach(c=>c.abort());map.stop();map.remove();},
 };
}
