import {body,cleanup,db,invitation,json,safe} from '../../../lib/relay-server';
import {ApiError,requireFresh,submission} from '../../../lib/relay-validation';
export async function POST(req:Request){return safe(async()=>{
 const p=submission(await body(req)),i=await invitation(p.token);await cleanup();
 const existing=async()=>await db().prepare('SELECT * FROM reports WHERE request_id=? AND submission_id=?').bind(i.id,p.submissionId).first<Record<string,unknown>>() || await db().prepare('SELECT * FROM positions WHERE request_id=? AND submission_id=?').bind(i.id,p.submissionId).first<Record<string,unknown>>();
 const confirm=(row:Record<string,unknown>)=>{if(row.lat!==p.lat||row.lon!==p.lon||row.accuracy!==p.accuracy||row.crs!==p.crs||row.captured_at!==p.capturedAt)throw new ApiError('本次发送编号已使用，不能覆盖原位置；请重新定位后发送。',409);return json({received:true,receivedAt:row.received_at});};
 const old=await existing();if(old)return confirm(old);requireFresh(p.capturedAt);
 await db().prepare(`INSERT INTO reports (id,request_id,submission_id,lat,lon,accuracy,crs,captured_at,received_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM invitations WHERE id=?) AND (SELECT count(*) FROM reports WHERE request_id=?)<1000 ON CONFLICT(request_id,submission_id) DO NOTHING`).bind(crypto.randomUUID(),i.id,p.submissionId,p.lat,p.lon,p.accuracy,p.crs,p.capturedAt,Date.now(),i.id,i.id).run();
 const saved=await existing();if(!saved)throw new ApiError('入口已停用或记录数量已满，请联系接收方',429);return confirm(saved);
});}
