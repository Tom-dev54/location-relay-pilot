import region from './data/mainland-region.json' with {type:'json'};
export type MapProvider='amap'|'world';
export type MapPoint={lat:number;lon:number;crs:string;accuracy?:number};
type XY=number[];
const polygons=region.coordinates as XY[][][];
function inRing(x:number,y:number,ring:XY[]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function validMapPoint(p:MapPoint){return Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;}
export function mapRegion(p:MapPoint){
 if(!validMapPoint(p))throw Error('位置坐标无效');
 const mainland=polygons.some(poly=>inRing(p.lon,p.lat,poly[0])&&!poly.slice(1).some(r=>inRing(p.lon,p.lat,r)));
 // A coarse public boundary is only a service-routing hint, never a legal boundary.
 const margin=Math.max(5000,Math.min(p.accuracy||0,100000)),sx=111320*Math.cos(p.lat*Math.PI/180),sy=111320;
 let nearBoundary=false;
 outer:for(const poly of polygons)for(const ring of poly)for(let i=1;i<ring.length;i++){
  const ax=(ring[i-1][0]-p.lon)*sx,ay=(ring[i-1][1]-p.lat)*sy,bx=(ring[i][0]-p.lon)*sx,by=(ring[i][1]-p.lat)*sy;
  if(Math.min(ax,bx)>margin||Math.max(ax,bx)<-margin||Math.min(ay,by)>margin||Math.max(ay,by)<-margin)continue;
  const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
  if(Math.hypot(ax+t*dx,ay+t*dy)<=margin){nearBoundary=true;break outer;}
 }
 return {mainland,nearBoundary,provider:(p.crs==='GCJ02'||mainland?'amap':'world') as MapProvider};
}
export function worldNavigation(p:MapPoint){
 if(p.crs!=='WGS84'||!validMapPoint(p))throw Error('此记录不能直接用于海外地图');
 const coordinate=`${p.lat},${p.lon}`;
 return {google:'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',destination:coordinate,travelmode:'driving'}),apple:'https://maps.apple.com/?'+new URLSearchParams({daddr:coordinate,dirflg:'d'})};
}
