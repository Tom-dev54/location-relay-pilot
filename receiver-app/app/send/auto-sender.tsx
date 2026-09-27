'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {CheckCircle2,LocateFixed,MapPin} from 'lucide-react';
import {createPublicDelivery,initialDelivery,type DeliveryView} from '../../lib/public-delivery';
import {date} from '../../lib/client';
export default function AutoSender(){
 const [label,setLabel]=useState(''),[attempt,setAttempt]=useState(0),[count,setCount]=useState(3),[countdown,setCountdown]=useState(true),[seconds,setSeconds]=useState(0),[view,setView]=useState<DeliveryView>(initialDelivery);
 const name=useRef(''),run=useRef<ReturnType<typeof createPublicDelivery>|null>(null),stopCurrent=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let active=true,n=3,elapsed:ReturnType<typeof setInterval>|undefined;
  run.current=null;setView({...initialDelivery});setCount(3);setCountdown(true);setSeconds(0);
  const timer=setInterval(()=>{setCount(--n);if(n!==0)return;clearInterval(timer);setCountdown(false);const start=Date.now();
   elapsed=setInterval(()=>setSeconds(Math.min(60,Math.floor((Date.now()-start)/1000))),1000);
   run.current=createPublicDelivery({geo:navigator.geolocation,label:()=>name.current,onChange:s=>{if(active){setView(s);if(!s.refining&&s.phase!=='locating')clearInterval(elapsed);}}});
  },1000);
  const stop=()=>{clearInterval(timer);clearInterval(elapsed);if(run.current)run.current.stop();else if(active){setCountdown(false);setView({...initialDelivery,phase:'stopped',reason:'已停止，本次未发送位置'});}};
  stopCurrent.current=stop;const hidden=()=>{if(document.hidden)stop();};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
  return()=>{active=false;stop();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);};
 },[attempt]);
 const sent=!!view.delivered,p=view.delivered||view.point;
 const working=countdown||view.phase==='locating'||view.phase==='sending'||view.refining||view.updating;
 return <main className="shell sender-shell public-ui"><header className="top"><span className="brand"><MapPin/>位置回传</span></header>
  <section className="panel send-panel"><h1>{sent?'位置已送达':'允许定位，自动回传'}</h1>
   <p className="public-notice">公开测试：本次位置会显示在所有人可访问的测试看板，保留7天。允许定位后，首次有效位置立即发送；保持页面打开会再观察最多20秒，有明显改善时更新一次同一条记录。不会持续跟踪。</p>
   {!sent&&<><label htmlFor="test-name">称呼或场景（可以不填）</label><input id="test-name" value={label} maxLength={40} placeholder="例如：小李 / 楼下测试" disabled={!!view.point} onChange={e=>{name.current=e.target.value;setLabel(e.target.value);}}/></>}
   <div className={sent?'success-state':'location-state'} role="status">
    {sent?<CheckCircle2 size={48}/>:<LocateFixed size={38}/>}
    <h2>{sent?'发送成功':countdown?`${count}秒后请求定位权限`:view.phase==='locating'?`正在定位 · ${seconds}秒`:view.phase==='sending'?'正在回传位置':view.phase==='retry'?'等待重试':view.phase==='failed'?'位置未确认送达':'定位已停止'}</h2>
    <p>{countdown?'浏览器询问位置权限时，请选择允许。':view.reason}</p>
    {sent&&view.refining&&<p>正在短时改善精度，你也可以直接关闭页面。</p>}
    {p&&<p>{sent?'已送达位置':'当前取得位置'}的设备报告精度：约 {Math.round(p.accuracy)} 米</p>}
   </div>
   {view.error&&<p className="alert" role="alert">{view.error}</p>}
   {view.canRetry&&<Button className="action wide" onClick={()=>run.current?.retry()}>重试{sent?'精度更新':'发送'}</Button>}
   {working&&<Button className="action secondary wide" onClick={()=>stopCurrent.current()}>{sent?'结束精度优化':view.point?'停止后续操作':'停止，不发送'}</Button>}
   {!working&&<Button className="action wide" onClick={()=>setAttempt(v=>v+1)}>{sent?'再测一次':'重新尝试定位'}</Button>}
   {p&&<details><summary>查看本次坐标</summary><p>{p.lat.toFixed(6)}, {p.lon.toFixed(6)} · {date(p.timestamp)}</p></details>}
   <p className="fine">首次有效位置立即回传，不设精度门槛。报告精度不等于实际误差；整次定位采集不超过60秒。网络慢时会有限次数自动重试；切到后台会停止后续操作。若微信阻止定位，可在右上角选择“在浏览器打开”。</p>
  </section></main>;
}
