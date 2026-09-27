import {body,db,json,owner,safe} from '../../../../lib/relay-server';
import {ApiError,keys} from '../../../../lib/relay-validation';
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){return safe(async()=>{const uid=await owner(req);keys(await body(req),[]);const {id}=await params;const result=await db().prepare('DELETE FROM invitations WHERE id=? AND owner_id=?').bind(id,uid).run();if(!result.meta.changes)throw new ApiError('记录不存在或已删除',404);return json({deleted:true});});}
