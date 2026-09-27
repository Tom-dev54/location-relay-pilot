import {body, db, DAY, hash, json, safe} from './relay-server';
import {ApiError, keys, label, requireFresh, submission} from './relay-validation';
import {DELIVERY_MS, meaningfullyBetter, REFINE_MS} from './location-policy';

type Stored = {id:string;label:string;lat:number;lon:number;accuracy:number;crs:string;captured_at:number;received_at:number;mode:string;initial_snapshot:string|null;update_token_hash:string|null;revision:number;updated_at:number|null};
type Fix = ReturnType<typeof submission>;
const receipt = (r:Stored) => json({received:true,receivedAt:r.received_at,revision:r.revision,updatedAt:r.updated_at});
const snapshot = (r:Pick<Stored,'id'|'label'|'mode'|'lat'|'lon'|'accuracy'|'crs'|'captured_at'>) => JSON.stringify({id:r.id,label:r.label,mode:r.mode,lat:r.lat,lon:r.lon,accuracy:r.accuracy,crs:r.crs,captured_at:r.captured_at});
const position = (id:unknown,p:unknown) => submission({token:'0'.repeat(64),submissionId:id,confirmed:true,position:p});
const matches = (r:Stored,p:Fix) => r.lat===p.lat&&r.lon===p.lon&&r.accuracy===p.accuracy&&r.crs===p.crs&&r.captured_at===p.capturedAt;
const existing = (id:string) => db().prepare('SELECT * FROM public_positions WHERE id=?').bind(id).first<Stored>();
function updateToken(value:unknown) {
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)) throw new ApiError('此位置不可更新',403,'UPDATE_FORBIDDEN');
  return value;
}
export async function cleanupPublic(){await db().prepare('DELETE FROM public_positions WHERE received_at<?').bind(Date.now()-7*DAY).run();}
export async function listPublic(){return safe(async()=>{
  await cleanupPublic();
  const r=await db().prepare('SELECT id,label,lat,lon,accuracy,crs,captured_at,received_at,mode,revision,updated_at FROM public_positions ORDER BY received_at DESC LIMIT 100').all();
  return json({records:r.results});
});}
export async function createPublic(req:Request){return safe(async()=>{
  const raw=await body(req),v2=raw?.notice==='public-location-v2';
  const v=keys(raw,['id','label','position','mode','notice',...(v2?['updateToken']:[])]);
  if(!['public-location-v1','public-location-v2'].includes(String(v.notice))||!['auto','manual'].includes(String(v.mode)))throw new ApiError('缺少公开测试用途说明');
  const p=position(v.id,v.position),name=label(v.label);
  const tokenHash=v2?await hash(updateToken(v.updateToken)):null;
  const initial=snapshot({id:p.submissionId,label:name,mode:String(v.mode),lat:p.lat,lon:p.lon,accuracy:p.accuracy,crs:p.crs,captured_at:p.capturedAt});
  const confirm=(r:Stored)=>{
    if(r.update_token_hash!==tokenHash||(r.initial_snapshot||snapshot(r))!==initial)throw new ApiError('发送编号冲突，请重新定位',409,'ID_CONFLICT');
    return receipt(r);
  };
  await cleanupPublic();
  const old=await existing(p.submissionId);if(old)return confirm(old);
  requireFresh(p.capturedAt);
  await db().prepare(`INSERT INTO public_positions (id,label,lat,lon,accuracy,crs,captured_at,received_at,mode,initial_snapshot,update_token_hash,revision,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,0,NULL WHERE (SELECT count(*) FROM public_positions)<5000 ON CONFLICT(id) DO NOTHING`)
    .bind(p.submissionId,name,p.lat,p.lon,p.accuracy,p.crs,p.capturedAt,Date.now(),v.mode,initial,tokenHash).run();
  const saved=await existing(p.submissionId);if(!saved)throw new ApiError('测试记录已满，请稍后重试',429,'RECORDS_FULL');
  return confirm(saved);
});}
export async function refinePublic(req:Request,id:string){return safe(async()=>{
  const v=keys(await body(req),['position','updateToken']);
  const tokenHash=await hash(updateToken(v.updateToken)),p=position(id,v.position);
  const row=await existing(id);
  if(!row||!row.update_token_hash||row.update_token_hash!==tokenHash||!row.initial_snapshot||row.received_at<Date.now()-7*DAY)throw new ApiError('此位置不可更新',403,'UPDATE_FORBIDDEN');
  const confirm=(r:Stored)=>{if(!matches(r,p))throw new ApiError('本次位置已更新，不能再次修改',409,'ALREADY_REFINED');return receipt(r);};
  if(row.revision===1)return confirm(row);
  const first=JSON.parse(row.initial_snapshot) as Stored;
  const now=Date.now();
  if(now-row.received_at>DELIVERY_MS)throw new ApiError('精度优化窗口已结束，首次位置已保留',410,'REFINEMENT_EXPIRED');
  requireFresh(p.capturedAt,now);
  if(p.crs!==first.crs||p.capturedAt<=first.captured_at||p.capturedAt>first.captured_at+REFINE_MS||!meaningfullyBetter(first.accuracy,p.accuracy))throw new ApiError('这次位置未满足精度改善条件',400,'INVALID_REFINEMENT');
  await db().prepare(`UPDATE public_positions SET lat=?,lon=?,accuracy=?,crs=?,captured_at=?,revision=1,updated_at=?
    WHERE id=? AND revision=0 AND update_token_hash=? AND received_at>=?`)
    .bind(p.lat,p.lon,p.accuracy,p.crs,p.capturedAt,now,id,tokenHash,now-DELIVERY_MS).run();
  const saved=await existing(id);
  if(!saved||saved.revision!==1)throw new ApiError('位置更新未确认，请重试',503);
  return confirm(saved);
});}
