export class RequestError extends Error {
  status:number;code:string;retryAfterMs:number;
  constructor(message:string,status=0,code='',retryAfterMs=0){super(message);this.name='RequestError';this.status=status;this.code=code;this.retryAfterMs=retryAfterMs;}
}
export function transient(error:unknown){return error instanceof RequestError&&error.code!=='RECORDS_FULL'&&(error.status===0||error.status===408||error.status===429||error.status>=500);}
