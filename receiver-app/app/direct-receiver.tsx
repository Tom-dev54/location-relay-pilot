'use client';
import {useCallback,useEffect,useState} from 'react';
import Dashboard from './receiver';
import {initializeReceiver,RECEIVER_STORAGE,validReceiverKey} from '../lib/receiver-key';
export default function DirectReceiver(){
 const [receiver,setReceiver]=useState<{key:string;persisted:boolean;url:string}|null>(null),[error,setError]=useState(''),[ready,setReady]=useState(false),[input,setInput]=useState('');
 const init=useCallback((create=false)=>{try{let storage:Storage|null=null,saved:string|null=null;try{storage=localStorage;saved=storage.getItem(RECEIVER_STORAGE);}catch{}if(!create&&!new URLSearchParams(location.hash.slice(1)).has('receive')&&!saved){setReady(true);return;}const r=initializeReceiver(location.hash,storage,()=>crypto.getRandomValues(new Uint8Array(32)));const url=location.origin+'/#receive='+r.key;setReceiver({...r,url});setReady(true);setError('');history.replaceState(null,'',url);}catch(e){setReady(true);setError(e instanceof Error?e.message:'无法打开接收页，请重试');}},[]);
 useEffect(()=>{const run=()=>{if(navigator.locks)void navigator.locks.request('loc119-receiver-init',()=>init());else init();};run();window.addEventListener('hashchange',run);return()=>window.removeEventListener('hashchange',run);},[init]);
 function restore(e:React.FormEvent){e.preventDefault();try{const url=new URL(input.trim());if(url.origin!==location.origin||!validReceiverKey(new URLSearchParams(url.hash.slice(1)).get('receive')))throw Error();history.replaceState(null,'',url.origin+'/'+url.hash);init();}catch{setError('请粘贴另一个浏览器中复制的完整接收链接，需包含 #receive= 后面的部分。');}}
 if(receiver)return <Dashboard key={receiver.key} receiveKey={receiver.key} receiveUrl={receiver.url} persisted={receiver.persisted}/>;
 if(!ready)return <p className="notice" role="status">正在打开接收页面…</p>;
 return <section className="panel access-box"><h1>打开同一个接收页面</h1><p>换浏览器或换手机？请从原来的接收页复制完整接收链接，在这里打开，就能同步看到同一批记录，无需登录。</p><form onSubmit={restore}><label htmlFor="receive-entry">已有的完整接收链接</label><textarea id="receive-entry" value={input} onChange={e=>setInput(e.target.value)} placeholder="粘贴原接收页的完整链接"/><button className="action" disabled={!input.trim()}>打开已有接收页面</button></form>{error&&<p className="alert" role="alert">{error}</p>}<p className="fine">只有第一次使用、还没有接收入口时，才创建新的接收页面。</p><button className="action secondary" onClick={()=>init(true)}>首次使用，创建接收页面</button></section>;
}
