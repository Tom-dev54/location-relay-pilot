import {distanceMetres} from './auto-location';
import type {Place} from './place-description';
import {readablePlaceName} from './world-labels';
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
export function worldPlace(raw:unknown,target:{lat:number;lon:number},accuracy:number):Place|null{
 const r=raw as {results?:Record<string,unknown>[]};const p=r?.results?.[0];if(!p)return null;
 const area=[p.street,p.suburb,p.district,p.city,p.county,p.state,p.country].map(text).filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ');
 if(accuracy>200)return area?{title:area,address:'参考街道或片区，不能确认具体建筑或入口',relative:''}:null;
 const name=readablePlaceName(text(p.name)),address=text(p.formatted)||area;let relative='';
 if(name&&typeof p.lat==='number'&&typeof p.lon==='number'){
  const d=distanceMetres(target,{lat:p.lat,lon:p.lon});
  if(d<=300){const rad=Math.PI/180,a=p.lat*rad,b=target.lat*rad,dl=(target.lon-p.lon)*rad,bearing=(Math.atan2(Math.sin(dl)*Math.cos(b),Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(dl))/rad+360)%360;
   relative=d<10?`靠近${name}地图标注点`:`采集点在${name}${['北侧','东北侧','东侧','东南侧','南侧','西南侧','西侧','西北侧'][Math.round(bearing/45)%8]}约${Math.round(d/10)*10}米（直线估算）`;
   return {title:name+'附近',address,relative};
  }
 }
 // A reverse-geocoded object can be far away; never assert it is the occupied building.
 return area||address?{title:area||address,address:area?'附近地图参考地址；具体建筑待核对':address,relative:''}:null;
}
