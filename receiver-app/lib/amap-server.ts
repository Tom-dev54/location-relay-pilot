import {env} from 'cloudflare:workers';
export function mapConfig(){const vars=env as unknown as Record<string,string|undefined>;return {key:vars.AMAP_JS_KEY||'',security:vars.AMAP_SECURITY_CODE||''};}
