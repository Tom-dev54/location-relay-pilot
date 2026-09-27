import { env } from 'cloudflare:workers';
import { validReceiverKey } from './receiver-key';
import { ApiError } from './relay-validation';
export const DAY=86400000;
export function db(){if(!env.DB)throw new ApiError('接收服务暂时不可用，请稍后重试',503);return env.DB;}
export async function owner(req:Request){const key=req.headers.get('x-location-receiver')||'';if(!validReceiverKey(key))throw new ApiError('请使用你的专属接收入口',401);return 'cap:'+await hash(key);}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});}
export async function safe(fn:()=>Promise<Response>){try{return await fn();}catch(e){if(e instanceof ApiError)return json({error:e.message,...(e.code?{code:e.code}:{})},e.status);console.error('relay_operation_failed');return json({error:'接收服务暂时不可用，数据未确认。请重试。'},503);}}
export async function body(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError('请从本页面操作',403);
 if(!req.headers.get('content-type')?.startsWith('application/json'))throw new ApiError('请使用 JSON 提交',415);
 if(Number(req.headers.get('content-length')||0)>4096)throw new ApiError('提交内容过大',413);
 const reader=req.body?.getReader();if(!reader)throw new ApiError('缺少提交内容');let length=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();throw new ApiError('提交内容过大',413);}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError('提交内容格式不正确');}
}
export async function hash(s:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
export function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function cleanup(){const cutoff=Date.now()-7*DAY;await db().batch([db().prepare('DELETE FROM positions WHERE received_at < ?').bind(cutoff),db().prepare('DELETE FROM reports WHERE received_at < ?').bind(cutoff)]);}
export async function invitation(t:string){const row=await db().prepare('SELECT * FROM invitations WHERE token_hash = ?').bind(await hash(t)).first<{id:string;label:string}>();if(!row)throw new ApiError('发送入口已停用或链接不完整，请向对方索取完整链接',404);return row;}
