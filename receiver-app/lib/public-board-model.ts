import type {Point} from './client';
export type PublicRow={id:string;label:string;lat:number;lon:number;accuracy:number;crs:string;captured_at:number;received_at:number;mode:'auto'|'manual';revision:number;updated_at:number|null};
export const asPoint=(r:PublicRow):Point=>({lat:r.lat,lon:r.lon,accuracy:r.accuracy,crs:r.crs,timestamp:new Date(r.captured_at).toISOString()});
export const mapKey=(r:PublicRow)=>`${r.id}:${r.revision||0}:${r.lat}:${r.lon}:${r.accuracy}:${r.crs}`;
export function wantedRecords(records:PublicRow[],selected:string,visible:string[]){
 const ids=new Set([selected,...records.slice(0,10).map(r=>r.id),...visible]);
 return [...records.filter(r=>r.id===selected),...records.filter(r=>r.id!==selected&&ids.has(r.id))];
}
