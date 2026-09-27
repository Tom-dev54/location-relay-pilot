import {refinePublic} from '../../../../lib/public-positions-server';
export const dynamic='force-dynamic';
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){
  return refinePublic(req,(await ctx.params).id);
}
