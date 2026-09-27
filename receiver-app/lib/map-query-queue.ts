export function createMapQueryQueue<T,R>(opts:{key:(item:T)=>string;query:(item:T)=>Promise<R>;onResult:(key:string,result:R)=>void;onError:(key:string,error:unknown)=>void;concurrency?:number}){
 let tasks:T[]=[],stopped=false;const running=new Set<string>(),finished=new Set<string>();
 function pump(){
  if(stopped)return;
  for(const task of tasks){
   if(running.size>=(opts.concurrency??2))break;
   const key=opts.key(task);if(running.has(key)||finished.has(key))continue;
   running.add(key);
   void Promise.resolve().then(()=>opts.query(task)).then(result=>{if(!stopped){finished.add(key);opts.onResult(key,result);}},error=>{if(!stopped){finished.add(key);opts.onError(key,error);}}).finally(()=>{running.delete(key);pump();});
  }
 }
 return {setTasks(next:T[]){tasks=next;pump();},retry(key:string){finished.delete(key);pump();},stop(){stopped=true;tasks=[];}};
}
