import type {Point} from './client';
export type CaptureRecord={id:string;status:string;reason:string;position:Point|null;[key:string]:unknown};
export type Session={start:()=>unknown;stop:(reason?:string)=>unknown;snapshot:()=>unknown};
