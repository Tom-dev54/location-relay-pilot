export class ApiError extends Error {status:number;code?:string;constructor(message:string,status=400,code?:string){super(message);this.status=status;this.code=code;}}
export function keys(value:unknown,allowed:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError('提交内容格式不正确');
 const obj=value as Record<string,unknown>;
 if(Object.keys(obj).some(k=>!allowed.includes(k))||allowed.some(k=>!(k in obj)))throw new ApiError('提交字段不正确');return obj;
}
export function token(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new ApiError('邀请无效或已过期',404);return value;}
export function label(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.length>40||/[<>\x00-\x1f\x7f]/.test(value))throw new ApiError('请填写 1–40 字的朋友称呼或测试场景');return value.trim();}
export function submission(value:unknown){
 const data=keys(value,['token','submissionId','confirmed','position']),p=keys(data.position,['lat','lon','accuracy','crs','timestamp']);
 if(data.confirmed!==true)throw new ApiError('请先确认发送位置');
 if(typeof data.submissionId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(data.submissionId))throw new ApiError('发送编号无效');
 const num=(v:unknown,min:number,max:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new ApiError('坐标或设备报告精度无效');return v;};
 if(p.crs!=='WGS84'&&p.crs!=='GCJ02')throw new ApiError('坐标系无效');
 if(typeof p.timestamp!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.timestamp))throw new ApiError('采集时间无效');
 const capturedAt=Date.parse(p.timestamp);if(!Number.isFinite(capturedAt)||new Date(capturedAt).toISOString()!==p.timestamp)throw new ApiError('采集时间无效');
 return {token:token(data.token),submissionId:data.submissionId,lat:num(p.lat,-90,90),lon:num(p.lon,-180,180),accuracy:num(p.accuracy,0,100000000),crs:p.crs,capturedAt};
}
export function requireFresh(capturedAt:number,now=Date.now()){if(capturedAt<now-10*60000||capturedAt>now+60000)throw new ApiError('位置已超过 10 分钟或手机时间不正确，请重新定位',400,'POSITION_EXPIRED');}
