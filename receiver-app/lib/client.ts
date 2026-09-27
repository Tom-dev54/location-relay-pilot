import {RequestError} from './request-error';
export type Point={lat:number;lon:number;accuracy:number;crs:string;timestamp:string};
export type PositionRow={id:string;request_id:string;label:string;created_at:number;expires_at:number;lat:number|null;lon:number|null;accuracy:number|null;crs:string|null;captured_at:number|null;received_at:number|null};
export async function api<T=unknown>(path:string,method='GET',data?:unknown,receiveKey?:string,options:{signal?:AbortSignal;timeoutMs?:number}={}){
 const ctrl=new AbortController(),abort=()=>ctrl.abort();
 if(options.signal?.aborted)throw new DOMException('操作已停止','AbortError');
 options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,options.timeoutMs??15000);
 try{
  const res=await fetch(path,{method,headers:{'Content-Type':'application/json',...(receiveKey?{'X-Location-Receiver':receiveKey}:{})},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:ctrl.signal});
  const after=res.headers.get('retry-after');
  const retryAfterMs=after?Math.max(0,/^\d+(?:\.\d+)?$/.test(after)?Number(after)*1000:Date.parse(after)-Date.now()):0;
  if(!res.headers.get('content-type')?.includes('application/json'))throw new RequestError('服务暂时没有响应，结果尚未确认，请重试',res.ok?502:res.status,'INVALID_RESPONSE',retryAfterMs||0);
  const result=await res.json() as T&{error?:string;code?:string};
  if(!res.ok)throw new RequestError(result.error||'操作失败，请重试',res.status,result.code,retryAfterMs||0);
  return result;
 }catch(e){
  if(options.signal?.aborted)throw new DOMException('操作已停止','AbortError');
  if(e instanceof RequestError)throw e;
  if(e instanceof Error&&e.name==='AbortError')throw new RequestError('网络超时，结果尚未确认，请重试',0,'NETWORK_TIMEOUT');
  throw new RequestError('网络连接失败，结果尚未确认，请重试',0,'NETWORK_ERROR');
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
export function date(ms:number|string){return new Date(ms).toLocaleString('zh-CN',{hour12:false});}
export function message(e:unknown){return e instanceof Error?e.message:'网络连接失败，请稍后重试';}
export async function copy(value:string){try{await navigator.clipboard.writeText(value);return true;}catch{return false;}}
export function download(name:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function amap(p:Point,name='回传位置'){
 const params=new URLSearchParams({sourceApplication:'loc119',dlat:String(p.lat),dlon:String(p.lon),dname:name,dev:p.crs==='WGS84'?'1':'0',t:'0',m:'0'});
 const query=params.toString().replace(/\+/g,'%20');
 const marker=new URLSearchParams({position:`${p.lon},${p.lat}`,name,coordinate:p.crs==='WGS84'?'wgs84':'gaode',callnative:'0'});
 const ios=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 return {native:(ios?'iosamap://path?':'amapuri://route/plan/?')+query,web:'https://uri.amap.com/marker?'+marker.toString()};
}
