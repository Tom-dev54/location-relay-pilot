import {api,message,type Point} from './client';
import {createAutoSession} from './auto-location';
import {retryRequest} from './delivery-retry';
import {DELIVERY_MS,meaningfullyBetter} from './location-policy';
import {RequestError,transient} from './request-error';
export type DeliveryView={phase:'locating'|'sending'|'sent'|'stopped'|'retry'|'failed';reason:string;point:Point|null;delivered:Point|null;refining:boolean;updating:boolean;error:string;canRetry:boolean};
export const initialDelivery:DeliveryView={phase:'locating',reason:'请允许定位，正在获取本次位置',point:null,delivered:null,refining:false,updating:false,error:'',canRetry:false};
type Receipt={received:boolean;receivedAt:number;revision:number;updatedAt:number|null};
export function createPublicDelivery(opts:{geo:Geolocation|undefined;label:()=>string;onChange:(s:DeliveryView)=>void}){
 let view={...initialDelivery},first:Point|null=null,candidate:Point|null=null,closed=false,busy=false,ack=false,patchAttempted=false;
 let controller=new AbortController(),deadline=0,receivedAt=0;
 let firstPayload:unknown,patchPayload:unknown,id='';
 const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const emit=(patch:Partial<DeliveryView>)=>{view={...view,...patch};opts.onChange({...view});};
 const maybeImprove=()=>{if(!closed&&!busy&&ack&&candidate&&!patchAttempted)void send('refine');};
 async function send(kind:'first'|'refine',manual=false){
  if(busy||(!manual&&closed))return;
  if(manual){closed=false;controller=new AbortController();deadline=Date.now()+DELIVERY_MS;}
  if(kind==='refine'){
   if(!ack||!candidate)return;
   patchAttempted=true;
   if(Date.now()>receivedAt+DELIVERY_MS){emit({canRetry:false,error:'精度优化窗口已结束，首次位置已保留'});return;}
   patchPayload??={position:candidate,updateToken:secret};
  }
  busy=true;emit({phase:ack?'sent':'sending',updating:kind==='refine',error:'',canRetry:false,reason:kind==='first'?'正在回传位置':'首次位置已送达，正在提交精度改善'});
  const signal=controller.signal;
  try{
   const result=await retryRequest(timeoutMs=>api<Receipt>(kind==='first'?'/api/public-positions':'/api/public-positions/'+id,kind==='first'?'POST':'PATCH',kind==='first'?firstPayload:patchPayload,undefined,{signal,timeoutMs}),{
    signal,deadline:kind==='refine'?Math.min(deadline,receivedAt+DELIVERY_MS):deadline,
    onRetry:(n,wait)=>{if(!closed)emit({reason:`网络慢，${Math.ceil(wait/1000)}秒后自动重试（${n}/3）`});}
   });
   if(closed)return;
   ack=true;receivedAt=result.receivedAt;
   emit({phase:'sent',delivered:kind==='refine'?candidate:first,updating:false,reason:kind==='refine'?'位置已更新，报告精度得到改善':view.refining?'位置已送达，可以关闭；保持打开可继续改善位置':'位置已送达，可以关闭此页'});
  }catch(e){
   if(closed||signal.aborted)return;
   const canRetry=transient(e)||(e instanceof RequestError&&e.code==='AUTO_RETRY_ENDED');
   emit({phase:ack?'sent':canRetry?'retry':'failed',updating:false,canRetry,error:message(e)+(ack?'。首次位置仍保留在接收端。':'。尚未确认收到。'),reason:ack?'首次位置已送达':e instanceof RequestError&&e.code==='POSITION_EXPIRED'?'位置已过期，请重新定位':'位置尚未确认送达'});
  }finally{busy=false;if(kind==='first')maybeImprove();}
 }
 const capture=createAutoSession({geo:opts.geo,
  onUpdate:(p,reason)=>{if(!closed)emit({point:p||view.point,...(!first?{reason}:{})});},
  onFirst:p=>{
   if(closed)return;first=p;id=crypto.randomUUID();deadline=Date.now()+DELIVERY_MS;
   firstPayload={id,label:opts.label().trim()||'测试位置',position:p,mode:'auto',notice:'public-location-v2',updateToken:secret};
   emit({point:p,refining:true});void send('first');
  },
  onFinish:r=>{
   if(closed)return;
   emit({refining:false});
   if(!first){emit({phase:'stopped',point:null,reason:r.reason});return;}
   if(r.status==='ready'&&r.point&&meaningfullyBetter(first.accuracy,r.point.accuracy)){candidate=r.point;maybeImprove();}
   else if(ack&&!view.updating)emit({reason:'短时观察已结束，首次位置已保留，可以关闭此页'});
  }
 });
 return {
  stop(){if(closed)return;closed=true;controller.abort();capture.stop();candidate=null;emit({phase:ack?'sent':'stopped',refining:false,updating:false,canRetry:false,error:'',reason:ack?'后续操作已停止，已送达的位置保留':first?'已停止后续操作；已发出的请求可能已送达，可在接收端确认':'已停止，本次未发送位置'});},
  retry(){if(!view.canRetry||busy)return;void send(ack?'refine':'first',true);}
 };
}
