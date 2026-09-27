'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {MapPin,Navigation,Copy,RefreshCw,Download} from 'lucide-react';
import {api,amap,copy,date,download,message} from '../lib/client';
import {createMapSurface,lookupPlace,type MapSurface,type Mapped,type BaseState} from '../lib/map-surface';
import {mapRegion,worldNavigation,type MapProvider} from '../lib/map-region';
import {createMapQueryQueue} from '../lib/map-query-queue';
import {asPoint,mapKey,wantedRecords,type PublicRow} from '../lib/public-board-model';
export default function PublicBoard(){
 const [records,setRecords]=useState<PublicRow[]>([]),[selected,setSelected]=useState(''),[mapped,setMapped]=useState<Record<string,Mapped>>({}),[error,setError]=useState(''),[last,setLast]=useState(0);
 const [mapError,setMapError]=useState(''),[sdk,setSdk]=useState<MapSurface|null>(null),[reload,setReload]=useState(0),[compatible,setCompatible]=useState(false),[routeText,setRouteText]=useState(''),[routing,setRouting]=useState(false),[notice,setNotice]=useState(''),[share,setShare]=useState(''),[wechat,setWechat]=useState(false);
 const [baseState,setBaseState]=useState<BaseState>({status:'loading',message:'正在加载地图…'}),[overrides,setOverrides]=useState<Record<string,MapProvider>>({});
 const [visible,setVisible]=useState<string[]>([]),[unread,setUnread]=useState<string[]>([]),[highlights,setHighlights]=useState<Record<string,number>>({});
 const mapEl=useRef<HTMLDivElement>(null),listEl=useRef<HTMLElement>(null),map=useRef<MapSurface|null>(null);
 const routeGeneration=useRef(0),routeFix=useRef(''),busy=useRef(false),seen=useRef<Set<string>|null>(null),queue=useRef<ReturnType<typeof createMapQueryQueue<PublicRow,Mapped>>|null>(null);
 const refresh=useCallback(async()=>{
  if(busy.current)return;busy.current=true;
  try{
   const r=await api<{records:PublicRow[]}>('/api/public-positions');
   if(seen.current){const fresh=r.records.filter(x=>!seen.current!.has(x.id));if(fresh.length){setUnread(old=>Array.from(new Set([...old,...fresh.map(x=>x.id)])).filter(id=>r.records.some(x=>x.id===id)));setHighlights(old=>({...old,...Object.fromEntries(fresh.map(x=>[x.id,Date.now()+30000]))}));}}
   seen.current??=new Set();r.records.forEach(x=>seen.current!.add(x.id));
   setUnread(old=>old.filter(id=>r.records.some(x=>x.id===id)));
   setRecords(r.records);setSelected(s=>r.records.some(x=>x.id===s)?s:r.records[0]?.id||'');setLast(Date.now());setError('');
  }catch(e){setError(message(e));}finally{busy.current=false;}
 },[]);
 useEffect(()=>{
  setShare(location.origin+'/send');setWechat(/MicroMessenger/i.test(navigator.userAgent));void refresh();
  const timer=setInterval(()=>{if(!document.hidden)void refresh();},5000),onVisible=()=>{if(!document.hidden)void refresh();};
  const highlightTimer=setInterval(()=>setHighlights(old=>Object.values(old).some(t=>t<=Date.now())?Object.fromEntries(Object.entries(old).filter(([,t])=>t>Date.now())):old),1000);
  document.addEventListener('visibilitychange',onVisible);return()=>{clearInterval(timer);clearInterval(highlightTimer);document.removeEventListener('visibilitychange',onVisible);};
 },[refresh]);
 const current=useMemo(()=>records.find(r=>r.id===selected),[records,selected]);
 const regions=useMemo(()=>Object.fromEntries(records.map(r=>[r.id,mapRegion(r)])),[records]);
 const providerFor=useCallback((r:PublicRow)=>overrides[r.id]||mapRegion(r).provider,[overrides]);
 const queryKey=useCallback((r:PublicRow)=>providerFor(r)+':'+mapKey(r),[providerFor]);
 const provider=current?providerFor(current):'amap';
 const select=(id:string)=>{setSelected(id);setUnread(old=>old.filter(x=>x!==id));};
 useEffect(()=>{
  if(!last)return;
  let stopped=false,owned:MapSurface|null=null;setMapError('');setSdk(null);
  const host=document.createElement('div');host.className='map-engine';mapEl.current?.appendChild(host);
  createMapSurface(provider,host,s=>{if(!stopped)setBaseState(s);},current,compatible).then(m=>{owned=m;if(stopped){m.destroy();host.remove();return;}map.current=m;setSdk(m);}).catch(e=>{if(!stopped){setMapError(message(e));setBaseState({status:'error',message:message(e)});}});
  return()=>{stopped=true;routeGeneration.current++;owned?.destroy();if(map.current===owned)map.current=null;host.remove();};
 // A refresh does not reload the map; only changing its provider or an explicit retry does.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[provider,reload,compatible,!!last]);
 const signature=records.map(mapKey).join('|');
 useEffect(()=>{
  if(!listEl.current||typeof IntersectionObserver==='undefined')return;
  const ids=new Set<string>(),observer=new IntersectionObserver(entries=>{entries.forEach(e=>{const id=(e.target as HTMLElement).dataset.recordId;if(id){if(e.isIntersecting)ids.add(id);else ids.delete(id);}});setVisible(Array.from(ids));},{threshold:.01});
  listEl.current.querySelectorAll('[data-record-id]').forEach(el=>observer.observe(el));return()=>observer.disconnect();
 },[signature]);
 useEffect(()=>{
  const q=createMapQueryQueue<PublicRow,Mapped>({key:queryKey,concurrency:2,
   query:r=>lookupPlace(providerFor(r),r),
   onResult:(key,result)=>setMapped(old=>({...old,[key]:result})),onError:(key,e)=>setMapped(old=>({...old,[key]:{error:message(e)}}))
  });queue.current=q;return()=>{q.stop();if(queue.current===q)queue.current=null;};
 // Cache keys and provider choices change only on data revision or manual selection.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[overrides]);
 useEffect(()=>{queue.current?.setTasks(wantedRecords(records,selected,visible));},[records,selected,visible,overrides]);
 const mappedFor=(r:PublicRow):Mapped=>mapped[queryKey(r)]||(providerFor(r)==='world'&&r.crs==='WGS84'?{coordinates:[r.lon,r.lat]}:{});
 const currentKey=current?queryKey(current):'',currentMap=current?mappedFor(current):undefined,coordinateKey=currentMap?.coordinates?.join(',')||'';
 useEffect(()=>{
  if(!sdk||sdk!==map.current)return;
  sdk.markers(records.filter(r=>providerFor(r)===provider&&mappedFor(r).coordinates).map(r=>({id:r.id,coordinates:mappedFor(r).coordinates!,title:mappedFor(r).place?.title||r.label,selected:r.id===selected})),select);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[signature,mapped,sdk,provider,overrides,selected]);
 useEffect(()=>{
  const changed=routeFix.current!==currentKey,previousRoute=!!routeText||routing;
  routeFix.current=currentKey;routeGeneration.current++;setRouting(false);
  if(changed&&previousRoute)setRouteText('位置已变更，请重新规划路线');
  else if(changed)setRouteText('');
  if(sdk===map.current)sdk?.clearRoute();
  if(sdk&&sdk===map.current&&current&&currentMap?.coordinates)sdk.focus(currentMap.coordinates,current.accuracy);
 // Only changing the selected fix, map or coordinates invalidates a route.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[currentKey,coordinateKey,sdk]);
 function retryPlace(){if(!currentKey)return;queue.current?.retry(currentKey);setMapped(old=>{const next={...old};delete next[currentKey];return next;});}
 async function route(){
  if(!sdk||!map.current||!currentMap?.coordinates)return;
  const generation=++routeGeneration.current,destination=currentMap.coordinates;setRouting(true);setRouteText('正在获取你的位置，仅用于本页路线，不上传到公开看板');
  try{
   const p=await new Promise<GeolocationPosition>((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('浏览器不支持定位'));navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000});});
   if(Date.now()-p.timestamp>60000)throw Error('当前位置过旧，请重试');
   if(generation!==routeGeneration.current)return;
   const active=sdk;
   const result=await active.route({lat:p.coords.latitude,lon:p.coords.longitude,crs:'WGS84'},destination);
   if(generation!==routeGeneration.current)return;
   setRouteText(`驾车参考：约${(result.distance/1000).toFixed(1)}公里，${Math.max(1,Math.ceil(result.time/60))}分钟。你的设备报告精度约${Math.round(p.coords.accuracy)}米。`);
  }catch(e){if(generation===routeGeneration.current)setRouteText(e&&typeof e==='object'&&'code' in e&&typeof e.code==='number'?'无法获得你的当前位置，请允许定位后重试':message(e));}
  finally{if(generation===routeGeneration.current)setRouting(false);}
 }
 return <main className="public-ui board-shell"><header className="board-header"><div className="brand"><span className="brand-icon"><MapPin size={24}/></span><div>定位接力<span className="sub-brand">公开测试看板</span></div></div><div className="board-tools"><Button className="action secondary" onClick={()=>void refresh()} aria-label="刷新公开位置"><RefreshCw size={18}/></Button><Button className="action secondary" disabled={!records.length} onClick={()=>download('公开测试位置.json',{exportedAt:new Date().toISOString(),records})}><Download size={18}/>导出</Button></div></header>
  <div className="board-share"><div><b>给测试者的链接</b><a href={share}>{share||'/send'}</a></div><Button className="action" onClick={async()=>setNotice(await copy(share)?'已复制发送链接':'复制失败，请长按上面的链接复制')}><Copy size={18}/>复制链接</Button></div>
  {notice&&<p className="notice" role="status">{notice}</p>}
  <p className="board-caption">这里展示所有新测试回传。打开同一个首页，任何浏览器都能看到。{last>0&&` 最近更新 ${new Date(last).toLocaleTimeString('zh-CN',{hour12:false})}`}</p>
  {unread.length>0&&<div className="new-positions" role="status"><b>新收到{unread.length}条位置</b><Button className="action secondary" onClick={()=>{setSelected(records[0]?.id||'');setUnread([]);mapEl.current?.scrollIntoView({behavior:'smooth',block:'start'});}}>查看最新位置</Button></div>}
  {error&&<p className="alert" role="alert">{error}</p>}
  <div className="board-grid"><section className="map-pane"><div className="map-viewport"><div ref={mapEl} className="live-map" aria-label="测试位置地图"/>
   <div className={'map-arrival '+(provider==='world'&&baseState.status==='loading'&&!baseState.visible?'is-loading':'')} aria-hidden="true"><span className="arrival-pin"><MapPin size={30}/></span><strong>地图加载中…</strong></div>
  </div>
   {(baseState.status==='error'||mapError)&&<div className={'map-feedback '+(baseState.status==='error'?'failed':'')} role="status"><strong>{mapError||baseState.message}</strong>{baseState.status==='error'&&<Button className="action secondary" onClick={()=>setReload(x=>x+1)}>重新加载地图</Button>}{provider==='world'&&baseState.status==='error'&&!compatible&&<Button className="action secondary" onClick={()=>setCompatible(true)}>使用兼容底图</Button>}</div>}
   <div className="map-detail">{current?<>
    <div className="provider-controls"><span>当前地图：{provider==='world'?'海外地图':'高德地图'}</span><Button className="action secondary" aria-pressed={!overrides[current.id]} onClick={()=>setOverrides(old=>{const n={...old};delete n[current.id];return n;})}>自动选择</Button><Button className="action secondary" aria-pressed={overrides[current.id]==='amap'} onClick={()=>setOverrides(old=>({...old,[current.id]:'amap'}))}>高德</Button><Button className="action secondary" disabled={current.crs!=='WGS84'} aria-pressed={overrides[current.id]==='world'} onClick={()=>setOverrides(old=>({...old,[current.id]:'world'}))}>海外地图</Button></div>
    {regions[current.id]?.nearBoundary&&<p className="fine">靠近服务区域边界；若底图或地点查询不完整，可手动切换地图核对。</p>}
    {provider==='world'&&compatible&&<p className="fine"><button className="text-link" onClick={()=>setCompatible(false)}>切回高清地图</button></p>}{current.crs!=='WGS84'&&<p className="fine">此旧记录为高德坐标，使用高德显示。</p>}<span className="section-kicker">当前选中位置 · {current.label}</span><h1>{currentMap?.place?.title||(currentMap?.error?'地点名称暂不可用':'正在查询地点名称…')}</h1>
    {current.accuracy>200&&<p className="coarse-location">定位范围较大 · 设备报告精度约{Math.round(current.accuracy)}米，请结合街道或片区核对。</p>}
    {currentMap?.place?.address&&<p>{currentMap.place.address}</p>}{currentMap?.place?.relative&&<p>{currentMap.place.relative}</p>}
    {current.revision>0&&<p className="updated-location">位置已更新 · {date(current.updated_at||current.captured_at)}</p>}
    {currentMap?.error&&<div className="alert" role="alert"><p>{currentMap.error}，坐标仍可使用。</p><Button className="action secondary" onClick={retryPlace}>重试地点</Button></div>}
    <p className="fine">采集时间：{date(current.captured_at)}。地点为地图参考，蓝色圆圈为设备报告精度范围，不能据此确认具体楼栋或入口。</p>
    <p className="coordinate-detail">纬度 {current.lat.toFixed(6)} · 经度 {current.lon.toFixed(6)} · {current.crs}</p>
    <div className="map-actions"><Button className="action" disabled={!sdk||!currentMap?.coordinates||routing} onClick={()=>void route()}>{routing?'正在查询路线…':'在本页看我到这里的路线'}</Button>
     <a className="action secondary external-map" href={amap(asPoint(current),currentMap?.place?.title||'回传位置').native} onClick={e=>{if(wechat){e.preventDefault();setRouteText('微信内请在右上角选择“在浏览器打开”，再点高德导航。');}}}><Navigation size={18}/>高德导航</a>
     {provider==='world'&&current.crs==='WGS84'&&<><a className="action secondary external-map" href={worldNavigation(current).google} target="_blank" rel="noopener noreferrer">Google 地图导航</a><a className="action secondary external-map" href={worldNavigation(current).apple} target="_blank" rel="noopener noreferrer">苹果地图导航</a></>}
    </div>
    {provider==='world'&&wechat&&<p className="fine">若微信拦截地图跳转，请在右上角选择“在浏览器打开”。</p>}
    {routeText&&<p role="status" className="notice">{routeText}</p>}
   </>:<><h1>等待测试者回传位置</h1><p>把上方链接发给测试者。允许定位后，首次有效位置就会自动回传。</p></>}</div>
  </section>
  <section className="public-records" ref={listEl}><h2>回传位置 <span>{records.length}</span></h2>{!records.length&&<p className="empty-copy">还没有公开测试记录。原来的私人记录仍在原入口中。</p>}
   {records.map(r=>{const entry=mapped[queryKey(r)],place=entry?.place;return <button className={'public-record '+(r.id===selected?'selected ':'')+(highlights[r.id]?'fresh-record':'')} key={r.id} data-record-id={r.id} onClick={()=>select(r.id)}>
    <span className="record-topline"><b>{place?.title||(entry?.error?'地点名称暂未查询到':'选中可查看地点')}</b><span className="badge received">{highlights[r.id]?'刚刚收到':r.revision>0?'位置已更新':r.mode==='auto'?'自动回传':'手动回传'}</span></span>
    {place?.relative&&<span className="place-relative">{place.relative}</span>}<span className="public-meta">{r.label} · {date(r.received_at)}</span>
    <span>设备报告精度约 <strong>{Math.round(r.accuracy)}米</strong>{r.accuracy>200?' · 范围较大':''}</span><span className="coordinate-small">纬度 {r.lat.toFixed(6)} · 经度 {r.lon.toFixed(6)}</span>
   </button>;})}<p className="fine">显示最近100次回传，位置保留7天。大陆地图由高德提供，海外地图由 Geoapify / OpenStreetMap 提供；查询会将相应坐标提供给所选服务。测试中请勿提交不愿公开的位置。</p>
  </section></div></main>;
}
