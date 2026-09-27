import {RequestError,transient} from './request-error';
export function abortableWait(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
 if(signal.aborted){reject(new DOMException('已停止','AbortError'));return;}
 const abort=()=>{clearTimeout(timer);reject(new DOMException('已停止','AbortError'));};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
 signal.addEventListener('abort',abort,{once:true});
});}
export async function retryRequest<T>(request:(timeoutMs:number)=>Promise<T>,opts:{signal:AbortSignal;deadline:number;onRetry?:(attempt:number,waitMs:number)=>void;now?:()=>number;wait?:(ms:number,signal:AbortSignal)=>Promise<void>}){
 const now=opts.now||Date.now,wait=opts.wait||abortableWait,delays=[2000,5000,10000];
 for(let attempt=0;;attempt++){
  if(opts.signal.aborted)throw new DOMException('已停止','AbortError');
  if(now()>=opts.deadline)throw new RequestError('自动重试已结束，请检查网络后手动重试',400,'AUTO_RETRY_ENDED');
  try{return await request(Math.min(15000,opts.deadline-now()));}
  catch(e){
   if(opts.signal.aborted)throw new DOMException('已停止','AbortError');
   if(!transient(e)||attempt>=delays.length)throw e;
   const delay=Math.max(delays[attempt],e instanceof RequestError?e.retryAfterMs:0);
   if(now()+delay>=opts.deadline)throw new RequestError('服务器暂时繁忙，自动重试已结束，请稍后手动重试',400,'AUTO_RETRY_ENDED');
   opts.onRetry?.(attempt+1,delay);await wait(delay,opts.signal);
  }
 }
}
