(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LocCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1;
  var MAX_DURATION = 60000;
  var OBSERVE_DURATION = 30000;
  var MAX_POINTS = 1200;
  var MAX_HASH = 4096;
  var MAX_FUTURE = 5 * 60000;
  var STATUSES = ['success', 'denied', 'timeout', 'unavailable', 'cancelled', 'interrupted', 'unsupported'];
  var STATUS_TEXT = { success: '已获得位置', denied: '定位授权被拒绝', timeout: '等待超时', unavailable: '位置不可用', cancelled: '已停止', interrupted: '页面退出，中断采集', unsupported: '当前环境不支持定位' };

  function fail(message) { throw new Error(message); }
  function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(name + '格式不正确');
    return value;
  }
  function text(value, name, max, optional) {
    if (optional && (value === undefined || value === null)) return '';
    if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u001f\u007f]/.test(value)) fail(name + '格式不正确');
    var result = value.trim();
    if (!optional && !result) fail(name + '不能为空');
    return result;
  }
  function number(value, name, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(name + '超出有效范围');
    return value;
  }
  function date(value, name, referenceNow) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail(name + '必须是有效日期');
    var ms = Date.parse(value);
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value || ms < Date.UTC(2000, 0, 1) || ms > referenceNow + MAX_FUTURE) fail(name + '不是合理的日期');
    return value;
  }
  function point(value, referenceNow) {
    object(value, '位置');
    if (value.crs !== 'WGS84' && value.crs !== 'GCJ02') fail('不支持此坐标系');
    return {
      lat: number(value.lat, '纬度', -90, 90),
      lon: number(value.lon, '经度', -180, 180),
      crs: value.crs,
      accuracy: number(value.accuracy, '设备报告精度', 0, 100000000),
      timestamp: date(value.timestamp, '采集时间', referenceNow)
    };
  }
  function samePoint(a, b) {
    return a.lat === b.lat && a.lon === b.lon && a.crs === b.crs && a.accuracy === b.accuracy && a.timestamp === b.timestamp;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function normalizeRecord(input) {
    object(input, '记录');
    if (input.v !== VERSION) fail('不支持此记录版本');
    if (STATUSES.indexOf(input.status) < 0) fail('不支持此记录状态');
    if (input.source !== 'local' && input.source !== 'received') fail('不支持此记录来源');
    var current = Date.now();
    var started = date(input.startedAt, '开始时间', current);
    var ended = date(input.endedAt, '结束时间', current);
    if (Date.parse(ended) < Date.parse(started)) fail('结束时间早于开始时间');
    var points = input.points === undefined ? [] : input.points;
    if (!Array.isArray(points) || points.length > MAX_POINTS) fail('位置序列格式不正确');
    points = points.map(function (value) { return point(value, current); });
    var position = input.position === undefined || input.position === null ? null : point(input.position, current);
    if (points.length) {
      var last = points[points.length - 1];
      if (position && !samePoint(position, last)) fail('当前位置与最后一条采集记录不一致');
      position = clone(last);
    } else if (position) points.push(clone(position));
    if (input.status === 'success' && !position) fail('成功记录缺少位置');
    var firstFixMs = input.firstFixMs === undefined || input.firstFixMs === null ? null : number(input.firstFixMs, '首次定位耗时', 0, 86400000);
    var errorCode = input.errorCode === undefined || input.errorCode === null ? null : input.errorCode;
    if (errorCode !== null && [1, 2, 3].indexOf(errorCode) < 0) fail('错误代码无效');
    var record = {
      v: VERSION,
      id: text(input.id, '记录编号', 128, false),
      testId: text(input.testId, '测试编号', 64, false),
      scene: text(input.scene, '测试场景', 80, false),
      device: text(input.device, '设备标签', 80, true),
      startedAt: started,
      endedAt: ended,
      status: input.status,
      reason: text(input.reason, '结束原因', 200, true),
      firstFixMs: firstFixMs,
      points: points,
      position: position,
      errorCode: errorCode,
      source: input.source
    };
    if (input.importedAt !== undefined) record.importedAt = date(input.importedAt, '接收时间', current);
    return record;
  }

  function encodeUtf8(value) {
    var bytes = new TextEncoder().encode(value);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeUtf8(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) fail('位置链接编码不正确');
    var binary;
    try { binary = atob(value.replace(/-/g, '+').replace(/_/g, '/')); } catch (_) { fail('位置链接编码不正确'); }
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { fail('位置链接文字编码不正确'); }
  }
  function shareBase(value) {
    var url;
    try { url = new URL(value); } catch (_) { fail('需要有效的网页网址'); }
    var host = url.hostname.toLowerCase();
    var local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) fail('位置分享需要 HTTPS 网页网址');
    if (!local) {
      var privateHost = !host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.test') || host.includes(':');
      var ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
      if (ipv4) {
        var a = Number(ipv4[1]), b = Number(ipv4[2]);
        privateHost = a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224;
      }
      if (privateHost) fail('请先发布到可供另一部手机访问的 HTTPS 公网网址');
    }
    url.search = '';
    url.hash = '';
    return url;
  }
  function encodeShare(input, baseUrl) {
    var record = normalizeRecord(input);
    if (!record.position) fail('这条记录还没有可回传的位置');
    var url = shareBase(baseUrl);
    var payload = { v: VERSION, id: record.id, testId: record.testId, scene: record.scene, position: record.position };
    url.hash = 'loc=' + encodeUtf8(JSON.stringify(payload));
    if (url.hash.length > MAX_HASH) fail('位置链接过长');
    return url.href;
  }
  function exactKeys(value, keys, name) {
    object(value, name);
    if (Object.keys(value).length !== keys.length || Object.keys(value).some(function (key) { return keys.indexOf(key) < 0; })) fail(name + '字段不正确');
  }
  function decodeShare(input) {
    if (typeof input !== 'string' || input.length > MAX_HASH + 2048) fail('位置链接过长或格式不正确');
    var hash = input;
    if (!hash.startsWith('#')) {
      try { hash = new URL(hash).hash; } catch (_) { fail('位置链接格式不正确'); }
    }
    if (hash.length > MAX_HASH || !hash.startsWith('#loc=')) fail('位置链接格式不正确');
    var payload;
    try { payload = JSON.parse(decodeUtf8(hash.slice(5))); } catch (_) { fail('位置链接损坏或编码不正确'); }
    exactKeys(payload, ['v', 'id', 'testId', 'scene', 'position'], '位置链接');
    exactKeys(payload.position, ['lat', 'lon', 'crs', 'accuracy', 'timestamp'], '分享位置');
    var p = point(payload.position, Date.now());
    return normalizeRecord({
      v: payload.v, id: payload.id, testId: payload.testId, scene: payload.scene,
      device: '', startedAt: p.timestamp, endedAt: p.timestamp,
      status: 'success', reason: '收到分享位置，原始测试状态请以回传文字为准',
      firstFixMs: null, points: [p], position: p, errorCode: null,
      source: 'received', importedAt: new Date().toISOString()
    });
  }
  function navigationLinks(input) {
    var record = normalizeRecord(input);
    if (!record.position) fail('没有可导航的位置');
    var p = record.position;
    var name = '回传位置';
    var route = new URLSearchParams({ sourceApplication: 'loc119', dlat: String(p.lat), dlon: String(p.lon), dname: name, dev: p.crs === 'WGS84' ? '1' : '0', t: '0', m: '0' });
    var marker = new URLSearchParams({ position: p.lon + ',' + p.lat, name: name, coordinate: p.crs === 'WGS84' ? 'wgs84' : 'gaode', callnative: '0', src: 'loc119' });
    return {
      android: 'amapuri://route/plan/?' + route.toString().replace(/\+/g, '%20'),
      ios: 'iosamap://path?' + route.toString().replace(/\+/g, '%20'),
      web: 'https://uri.amap.com/marker?' + marker.toString()
    };
  }
  function recordText(input, baseUrl) {
    var record = normalizeRecord(input);
    if (!record.position) fail('没有可回传的位置');
    var p = record.position;
    return [
      '【119 定位辅助 · 同事模拟测试】',
      '测试编号：' + record.testId,
      '场景：' + record.scene,
      '测试状态：' + STATUS_TEXT[record.status] + (record.reason ? '（' + record.reason + '）' : ''),
      '采集时间：' + p.timestamp,
      '纬度：' + p.lat + '，经度：' + p.lon + '（' + p.crs + '）',
      '设备报告精度：' + p.accuracy + ' 米（不等于真实误差）',
      '查看此位置：' + encodeShare(record, baseUrl),
      '此为测试手机位置，现场建筑和入口仍需确认。'
    ].join('\n');
  }

  function createSession(options) {
    options = options || {};
    var now = options.now || Date.now;
    var schedule = options.setTimeout || setTimeout;
    var unschedule = options.clearTimeout || clearTimeout;
    var geo = options.geolocation;
    var onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : function () {};
    var onFinish = typeof options.onFinish === 'function' ? options.onFinish : function () {};
    var metadata = {
      id: text(options.id, '记录编号', 128, false),
      testId: text(options.testId, '测试编号', 64, false),
      scene: text(options.scene, '测试场景', 80, false),
      device: text(options.device, '设备标签', 80, true)
    };
    var started = false, finished = false, startMs = null;
    var record = null, watchId = null, totalTimer = null, observationTimer = null;
    var lastErrorCode = null, observeUntil = null;
    function iso(ms) { return new Date(ms).toISOString(); }
    function snapshot() {
      if (!record) return null;
      var value = clone(record);
      value.finished = finished;
      value.elapsedMs = Math.max(0, (finished ? Date.parse(record.endedAt) : now()) - startMs);
      return value;
    }
    function update() { onUpdate(snapshot()); }
    function clear() {
      if (totalTimer !== null) unschedule(totalTimer);
      if (observationTimer !== null) unschedule(observationTimer);
      if (watchId !== null && geo && typeof geo.clearWatch === 'function') {
        try { geo.clearWatch(watchId); } catch (_) { /* Finished guard still rejects callbacks. */ }
      }
    }
    function finish(status, reason) {
      if (!started || finished) return snapshot();
      finished = true;
      record.status = status;
      record.reason = reason;
      record.endedAt = iso(now());
      clear();
      update();
      onFinish(clone(record));
      return snapshot();
    }
    function deadline() {
      if (record.position) return finish('success', '到达 60 秒采集上限');
      return finish(lastErrorCode === 2 ? 'unavailable' : 'timeout', lastErrorCode === 2 ? '等待 60 秒后仍无法获得位置' : '等待 60 秒仍未获得位置');
    }
    function expired() {
      if (now() - startMs >= MAX_DURATION) { deadline(); return true; }
      if (observeUntil !== null && now() >= observeUntil) {
        finish('success', '首次定位后已观察 30 秒或到达总时限');
        return true;
      }
      return false;
    }
    function accept(position) {
      if (finished || !started) return;
      if (expired()) return;
      var p;
      try {
        if (!position || typeof position.timestamp !== 'number' || !Number.isFinite(position.timestamp)) fail('无效采集时间');
        p = point({ lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy, crs: 'WGS84', timestamp: iso(position.timestamp) }, now());
        if (position.timestamp < startMs) fail('位置采集时间早于本次测试');
      } catch (_) {
        lastErrorCode = 2;
        record.errorCode = 2;
        record.reason = '收到无效或过时位置，继续等待新位置';
        update();
        return;
      }
      if (record.points.length >= MAX_POINTS) { finish('success', '已达到采集记录上限'); return; }
      record.points.push(p);
      record.position = clone(p);
      record.reason = '已获得位置，继续观察';
      record.errorCode = null;
      lastErrorCode = null;
      if (record.firstFixMs === null) {
        record.firstFixMs = Math.max(0, now() - startMs);
        var observeFor = Math.min(OBSERVE_DURATION, MAX_DURATION - record.firstFixMs);
        observeUntil = now() + observeFor;
        observationTimer = schedule(function () { finish('success', '首次定位后已观察 30 秒或到达总时限'); }, observeFor);
      }
      update();
    }
    function error(err) {
      if (finished || !started) return;
      if (expired()) return;
      var code = err && [1, 2, 3].indexOf(err.code) >= 0 ? err.code : 2;
      lastErrorCode = code;
      record.errorCode = code;
      if (code === 1) { finish('denied', '定位授权被拒绝或当前环境不允许定位'); return; }
      record.reason = code === 3 ? '本次位置请求超时，仍在等待总时限内的新位置' : '暂时无法获得位置，继续等待';
      update();
    }
    function start() {
      if (started) return snapshot();
      started = true;
      startMs = now();
      record = {
        v: VERSION, id: metadata.id, testId: metadata.testId, scene: metadata.scene, device: metadata.device,
        startedAt: iso(startMs), endedAt: null, status: 'running', reason: '等待定位授权和位置',
        firstFixMs: null, points: [], position: null, errorCode: null, source: 'local'
      };
      update();
      if (!geo || typeof geo.watchPosition !== 'function') return finish('unsupported', '当前环境不支持浏览器定位');
      totalTimer = schedule(deadline, MAX_DURATION);
      try {
        watchId = geo.watchPosition(accept, error, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
        if (finished && watchId !== null && typeof geo.clearWatch === 'function') geo.clearWatch(watchId);
      } catch (_) { finish('unavailable', '无法启动定位，请检查浏览器和系统定位设置'); }
      return snapshot();
    }
    function stop(reason) {
      reason = reason || 'manual';
      if (!started || finished) return snapshot();
      if (reason === 'interrupted') return finish('interrupted', '页面退出，中断采集');
      return finish(record.position ? 'success' : 'cancelled', record.position ? '手动结束，保留本次已获得位置' : '手动结束，尚未获得位置');
    }
    return { start: start, stop: stop, snapshot: snapshot };
  }

  return Object.freeze({
    normalizeRecord: normalizeRecord,
    encodeShare: encodeShare,
    decodeShare: decodeShare,
    navigationLinks: navigationLinks,
    recordText: recordText,
    createSession: createSession
  });
});
