import type {MapSurface,BaseState} from './map-surface';
import type {MapPoint} from './map-region';
import type {GeoJSONSource,Map as VectorMap,Marker} from 'maplibre-gl';
import type {Feature,Polygon} from 'geojson';
import {worldStyle} from './world-map-style';
import {bundledGlyphRanges} from './world-map-assets';
import {mapMarker} from './map-marker';
import {api} from './client';
import {warmApproach} from './world-map-prefetch';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import * as M from 'maplibre-gl';

function accuracyCircle(p:[number,number],radius:number):Feature<Polygon>{
 const angle=Math.min(Math.max(radius,1),20000000)/6371008.8,lat=p[1]*Math.PI/180,lon=p[0]*Math.PI/180;
 const coordinates=Array.from({length:65},(_,i)=>{const bearing=i/64*Math.PI*2,y=Math.asin(Math.sin(lat)*Math.cos(angle)+Math.cos(lat)*Math.sin(angle)*Math.cos(bearing)),x=lon+Math.atan2(Math.sin(bearing)*Math.sin(angle)*Math.cos(lat),Math.cos(angle)-Math.sin(lat)*Math.sin(y));return[x*180/Math.PI,y*180/Math.PI];});
 return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[coordinates]}};
}
export async function createWorldVector(el:HTMLElement,state:(s:BaseState)=>void,initial?:MapPoint):Promise<MapSurface>{
 M.setWorkerUrl(workerUrl);
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const countryZoom=4+Math.log2(Math.max(256,Math.min(el.clientWidth,el.clientHeight))/390);
 let map:VectorMap;
 try{map=new M.Map({container:el,style:worldStyle(location.origin),center:initial?[initial.lon,initial.lat]:[100,15],zoom:initial?(reducedMotion?16:countryZoom):4,maxZoom:20,attributionControl:{compact:true},localIdeographFontFamily:'sans-serif',pixelRatio:Math.min(devicePixelRatio||1,3),maxTileCacheSize:64,fadeDuration:reducedMotion?0:200,renderWorldCopies:false,
  transformRequest(url,type){
   // Stable icons and common Latin/Thai glyphs ship with the app; uncommon scripts use the bounded proxy.
   if(type==='Glyphs'){const part=decodeURIComponent(url).split('/api/world-map/fonts/Noto Sans Regular/')[1];if(part&&bundledGlyphRanges.includes(part.replace(/\.pbf$/,'')))return {url:location.origin+'/api/map-assets/v3/noto-regular-'+part};}
   return {url};
  }});}
 catch{el.replaceChildren();throw Error('当前浏览器不能显示高清地图');}
 el.dataset.renderer='vector';el.dataset.motion='loading';
 map.addControl(new M.NavigationControl({showCompass:false}),'top-left');map.addControl(new M.ScaleControl({unit:'metric'}));
 const points:Marker[]=[],empty={type:'FeatureCollection' as const,features:[]};
 let dead=false,loaded=false,epoch=0,lastError='',timer:ReturnType<typeof setTimeout>,pendingCircle:Feature<Polygon>|undefined,pendingBounds:InstanceType<typeof M.LngLatBounds>|undefined;
 let introPending=!reducedMotion,introEpoch=0,warming=Promise.resolve(),warmController=new AbortController();
 let arrivalTimer:ReturnType<typeof setTimeout>|undefined;
 const cancelArrival=()=>{clearTimeout(arrivalTimer);arrivalTimer=undefined;};
 const handlers=[map.scrollZoom,map.boxZoom,map.dragRotate,map.dragPan,map.keyboard,map.doubleClickZoom,map.touchZoomRotate];
 const enabledHandlers=handlers.filter(h=>h.isEnabled());
 const zoomButtons=Array.from(el.querySelectorAll<HTMLButtonElement>('.maplibregl-ctrl-zoom-in,.maplibregl-ctrl-zoom-out'));
 let introLocked=!reducedMotion;
 if(introLocked){enabledHandlers.forEach(h=>h.disable());zoomButtons.forEach(b=>b.disabled=true);}
 const unlock=()=>{if(!introLocked)return;introLocked=false;enabledHandlers.forEach(h=>h.enable());zoomButtons.forEach(b=>b.disabled=false);};
 const cancelIntro=()=>{introPending=false;introEpoch++;warmController.abort();cancelArrival();unlock();};
 const resize=new ResizeObserver(()=>{if(!dead)map.resize();});resize.observe(el);
 const emit=(s:BaseState)=>state({...s,visible:loaded});
 const busy=()=>{if(dead)return;emit({status:'loading',message:'地图加载中…'});clearTimeout(timer);timer=setTimeout(()=>{if(!dead)emit({status:'error',message:lastError||'地图加载较慢，请重试或使用下方高德导航'});},18000);};
 map.on('dataloading',busy);
 map.on('error',event=>{if((event as unknown as {sourceId?:string}).sourceId?.startsWith('relay-overture-'))return;if(!dead){lastError=(event.error as Error&{status?:number}).status===429?'地图查询已达测试上限，可使用下方高德导航':'部分地图内容未加载成功，请重新加载；也可直接使用高德导航';emit({status:'error',message:lastError});}});
 map.on('idle',()=>{if(dead)return;clearTimeout(timer);if(lastError){emit({status:'error',message:lastError});return;}if(introPending){el.dataset.motion='overview';emit({status:'loading',message:'地图加载中…'});return;}el.dataset.motion='ready';if(map.isStyleLoaded()&&map.areTilesLoaded())emit({status:'ready',message:''});});
 map.on('load',()=>{
  if(dead)return;loaded=true;
  map.addSource('relay-accuracy',{type:'geojson',data:pendingCircle||empty});
  map.addLayer({id:'relay-accuracy-fill',type:'fill',source:'relay-accuracy',paint:{'fill-color':'#1975e8','fill-opacity':.14}});
  map.addLayer({id:'relay-accuracy-line',type:'line',source:'relay-accuracy',paint:{'line-color':'#1975e8','line-width':2}});
  map.addSource('relay-route',{type:'geojson',data:empty});
  map.addLayer({id:'relay-route-line',type:'line',source:'relay-route',paint:{'line-color':'#1465d9','line-width':6},layout:{'line-cap':'round','line-join':'round'}});
  // Keep a real country-scale map on screen while destination tiles warm up.
  // Polling never restarts the intro; a newer selected destination supersedes it.
  emit({status:'loading',message:'地图加载中…'});
  startIntro();
 });
 busy();
 function startIntro(){
  if(!loaded||!pendingBounds||(!introPending&&!reducedMotion))return;
  const generation=++introEpoch;
  void warming.then(()=>{
   if(dead||generation!==introEpoch||!pendingBounds)return;
   introPending=false;approach(pendingBounds,16,!reducedMotion);
  });
 }
 function source(id:string){return map.getSource(id) as GeoJSONSource|undefined;}
 function approach(bounds:InstanceType<typeof M.LngLatBounds>,maxZoom:number,intro=false){
  cancelArrival();map.stop();el.dataset.motion=reducedMotion?'ready':'zooming';
  map.fitBounds(bounds,{padding:45,maxZoom,duration:reducedMotion?0:intro?1000:500,linear:true,easing:intro?t=>t*t*(3-2*t):t=>1-Math.pow(1-t,3)});
  // Complete the destination even if a layout resize/background tab interrupted easing.
  arrivalTimer=setTimeout(()=>{
   if(dead)return;const target=map.cameraForBounds(bounds,{padding:45,maxZoom});
   if(target){const center=M.LngLat.convert(target.center!);
    if(Math.abs(map.getZoom()-(target.zoom??map.getZoom()))>.03||map.getCenter().distanceTo(center)>2)map.jumpTo(target);
   }
   unlock();
  },reducedMotion?0:intro?1200:700);
 }
 return {
  markers(items,select){if(dead)return;points.splice(0).forEach(m=>m.remove());for(const p of items){const button=mapMarker(p,select);points.push(new M.Marker({element:button,anchor:'bottom'}).setLngLat(p.coordinates).addTo(map));}},
  focus(p,radius){
   if(dead)return;pendingCircle=accuracyCircle(p,radius);pendingBounds=new M.LngLatBounds();
   pendingCircle.geometry.coordinates[0].forEach(c=>pendingBounds!.extend([c[0],c[1]]));lastError='';
   if(loaded){source('relay-accuracy')?.setData(pendingCircle);if(introPending)startIntro();else{cancelIntro();approach(pendingBounds,16);}}
   else{
    warmController.abort();warmController=new AbortController();warming=reducedMotion?Promise.resolve():warmApproach(p[0],p[1],warmController.signal);
    const camera=map.cameraForBounds(pendingBounds,{padding:45,maxZoom:16});map.jumpTo({center:p,zoom:reducedMotion?(camera?.zoom??16):Math.min(countryZoom,camera?.zoom??16)});
   }
  },
  async route(start,end){
   cancelIntro();
   if(start.crs!=='WGS84')throw Error('当前位置坐标系不适用于海外地图');const requestEpoch=++epoch;
   const data=await api<{lines:[number,number][][];distance:number;time:number}>('/api/world-map/route','POST',{start:{lat:start.lat,lon:start.lon},end:{lat:end[1],lon:end[0]},crs:'WGS84'});
   if(dead||requestEpoch!==epoch)throw Error('位置已切换，请重新查询路线');
   if(!loaded)throw Error('地图仍在加载，请稍后重试路线或使用高德导航');
   source('relay-route')?.setData({type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:data.lines}});
   const bounds=new M.LngLatBounds();data.lines.flat().forEach(c=>bounds.extend(c));lastError='';approach(bounds,17);return data;
  },
  clearRoute(){epoch++;if(!dead&&loaded)source('relay-route')?.setData(empty);},
  destroy(){dead=true;epoch++;cancelIntro();clearTimeout(timer);resize.disconnect();points.forEach(m=>m.remove());map.remove();},
 };
}
