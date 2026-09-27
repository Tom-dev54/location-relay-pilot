import type {Point} from './client';
import {CAPTURE_MS,REFINE_MS,meaningfullyBetter} from './location-policy';

export type AutoResult = {
  status: 'ready' | 'denied' | 'timeout' | 'cancelled' | 'unsupported';
  point: Point | null;
  reason: string;
  elapsedMs: number;
};

export function distanceMetres(a:{lat:number;lon:number},b:{lat:number;lon:number}){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r,v=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));}

// onFirst enables one bounded refinement window; first delivery never waits for it.
export function createAutoSession(opts: {
  geo: Pick<Geolocation, 'watchPosition' | 'clearWatch'> | undefined;
  now?: () => number;
  schedule?: typeof setTimeout;
  cancelTimer?: typeof clearTimeout;
  onFirst?: (p:Point) => void;
  onUpdate: (p: Point | null, reason: string) => void;
  onFinish: (r: AutoResult) => void;
}) {
  const now = opts.now || Date.now;
  const schedule = opts.schedule || setTimeout;
  const cancelTimer = opts.cancelTimer || clearTimeout;
  const start = now();
  let done = false;
  let first:Point|null=null,best:Point|null=null;
  let end=start+CAPTURE_MS;
  let watch: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function finish(status: AutoResult['status'], reason: string, point: Point | null = null) {
    if (done) return;
    done = true;
    if (timer !== undefined) cancelTimer(timer);
    if (watch !== undefined) opts.geo?.clearWatch(watch);
    opts.onFinish({status, point, reason, elapsedMs: now() - start});
  }

  function accept(g: GeolocationPosition) {
    if (done) return;
    if (now() >= end) {
      complete();
      return;
    }
    const c = g.coords;
    if (!Number.isFinite(g.timestamp) || g.timestamp < start || g.timestamp > now() + 1000 ||
        ![c.latitude, c.longitude, c.accuracy].every(Number.isFinite) ||
        Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180 || c.accuracy < 0 || c.accuracy > 100000000) {
      opts.onUpdate(null, '设备返回了旧位置或无效数据，正在重新获取');
      return;
    }
    const point: Point = {lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, crs: 'WGS84', timestamp: new Date(g.timestamp).toISOString()};
    if(!first){
      first=best=point;
      opts.onUpdate(point,'已取得本次位置，正在自动回传');
      if(!opts.onFirst){finish('ready','已取得本次位置，自动回传一次',point);return;}
      end=Math.min(start+CAPTURE_MS,now()+REFINE_MS,Date.parse(point.timestamp)+REFINE_MS);
      if(timer!==undefined)cancelTimer(timer);
      timer=schedule(complete,Math.max(0,end-now()));
      opts.onFirst(point);
    }else if(Date.parse(point.timestamp)>Date.parse(first.timestamp)&&point.accuracy<best!.accuracy){
      best=point;
      opts.onUpdate(point,'正在短时观察，首次位置已开始回传');
    }
  }

  function complete(){
    if(first){const improved=best&&meaningfullyBetter(first.accuracy,best.accuracy);finish('ready',improved?'已取得报告精度更好的位置':'观察结束，保留首次位置',improved?best:first);}
    else finish('timeout','60秒内未取得本次有效位置，请检查定位设置或移到开阔处重试');
  }
  timer = schedule(complete,CAPTURE_MS);
  if (!opts.geo) {
    finish('unsupported', '此浏览器不支持定位');
  } else {
    try {
      watch = opts.geo.watchPosition(accept, error => {
        if (done) return;
        if (error.code === 1) finish('denied', first?'定位权限已关闭，后续采集已停止':'未允许定位，请在浏览器或系统设置中允许位置权限后重试');
        else opts.onUpdate(null, '设备暂未提供位置，正在继续获取');
      }, {enableHighAccuracy: true, maximumAge: 0, timeout: 10000});
      // Some implementations return a fix before watchPosition returns its ID.
      if (done && watch !== undefined) opts.geo.clearWatch(watch);
    } catch {
      finish('unsupported', '无法启动定位，请检查系统定位设置');
    }
  }
  return {stop: () => finish('cancelled', '已停止，本次不会自动发送')};
}
