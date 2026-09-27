import {body,invitation,json,safe} from '../../../lib/relay-server';
import {keys,token} from '../../../lib/relay-validation';
export async function POST(req:Request){return safe(async()=>{const data=keys(await body(req),['token']);const i=await invitation(token(data.token));return json({label:i.label,expiresAt:null,submitted:false});});}
