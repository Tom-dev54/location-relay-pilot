export const RECEIVER_STORAGE='loc119.receiver-key.v1';
export function validReceiverKey(value:unknown):value is string{return typeof value==='string'&&/^r_[a-f0-9]{64}$/.test(value);}
export function initializeReceiver(fragment:string,storage:Pick<Storage,'getItem'|'setItem'>|null,random:()=>Uint8Array){
 const params=new URLSearchParams(fragment.replace(/^#/,''));
 const incoming=params.get('receive');
 if(incoming!==null&&!validReceiverKey(incoming))throw new Error('接收入口不完整，请重新打开保存的完整链接。');
 let saved:string|null=null;
 try{saved=storage?.getItem(RECEIVER_STORAGE)||null;}catch{storage=null;}
 if(!incoming&&saved&&!validReceiverKey(saved))throw new Error('本机接收入口已损坏，请使用之前保存的专属接收链接。');
 const key=incoming||saved||'r_'+Array.from(random(),b=>b.toString(16).padStart(2,'0')).join('');
 if(!validReceiverKey(key))throw new Error('浏览器无法生成接收入口，请使用系统浏览器打开。');
 let persisted=false;
 try{if(storage){storage.setItem(RECEIVER_STORAGE,key);persisted=true;}}catch{}
 return {key,persisted};
}
