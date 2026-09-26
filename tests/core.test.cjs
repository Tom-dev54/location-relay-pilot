'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const EPOCH = Date.now() - 600000;
function point(overrides = {}) {
  return { lat: 31.2304161234567, lon: 121.4737011234567, crs: 'WGS84', accuracy: 12.3456789, timestamp: new Date(EPOCH).toISOString(), ...overrides };
}
function record(overrides = {}) {
  const p = point();
  return { v: 1, id: 'record-001', testId: '模拟-001', scene: '室外开阔', device: '测试机', startedAt: p.timestamp, endedAt: p.timestamp, status: 'success', reason: '手动结束', firstFixMs: 0, points: [p], position: p, errorCode: null, source: 'local', ...overrides };
}
function sharePayload(overrides = {}) {
  return { v: 1, id: 'record-001', testId: '模拟-001', scene: '室外开阔', position: point(), ...overrides };
}
function hash(payload) { return '#loc=' + Buffer.from(JSON.stringify(payload)).toString('base64url'); }
function rig(overrides = {}) {
  let now = EPOCH, timerId = 0, callbacks, cleared = [], options;
  const timers = new Map(), updates = [], results = [];
  const geo = {
    watchPosition(success, error, supplied) { callbacks = { success, error }; options = supplied; return 0; },
    clearWatch(id) { cleared.push(id); }
  };
  const session = C.createSession({
    geolocation: geo, now: () => now,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    onUpdate(snapshot) { updates.push(snapshot); }, onFinish(result) { results.push(result); },
    id: 'record-001', testId: '模拟-001', scene: '室外开阔', device: '测试机', ...overrides
  });
  function tick(delta) {
    const end = now + delta;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  }
  return { session, updates, results, cleared, timers, tick, jump(delta) { now += delta; },
    get options() { return options; },
    fix(coords = {}, timestamp = now) { callbacks.success({ timestamp, coords: { latitude: 31.2304, longitude: 121.4737, accuracy: 10, ...coords } }); },
    error(code) { callbacks.error({ code, message: '<script>untrusted error</script>' }); }
  };
}

test('normalization preserves precision, status and original input', () => {
  const input = record({ status: 'interrupted' });
  const before = structuredClone(input);
  const out = C.normalizeRecord(input);
  assert.deepEqual(input, before);
  assert.equal(out.status, 'interrupted');
  assert.equal(out.position.lat, input.position.lat);
  assert.notEqual(out.points, input.points);
  assert.notEqual(out.position, input.position);
});

test('zero latitude, longitude and accuracy are valid', () => {
  const p = point({ lat: 0, lon: 0, accuracy: 0 });
  const out = C.normalizeRecord(record({ position: p, points: [p] }));
  assert.equal(out.position.lat, 0);
  assert.equal(out.position.lon, 0);
});

test('invalid numbers and bounds are rejected without coercion', () => {
  for (const change of [{ lat: NaN }, { lon: Infinity }, { accuracy: Infinity }, { accuracy: -1 }, { lat: '31' }, { lat: 91 }, { lon: -181 }]) {
    const p = point(change);
    assert.throws(() => C.normalizeRecord(record({ position: p, points: [p] })));
  }
});

test('normalization rejects array objects, invalid status, missing position and inconsistent points', () => {
  assert.throws(() => C.normalizeRecord([]));
  assert.throws(() => C.normalizeRecord(record({ status: 'running' })));
  assert.throws(() => C.normalizeRecord(record({ points: [], position: null })));
  assert.throws(() => C.normalizeRecord(record({ position: point({ lon: 122 }) })));
});

test('invalid and future dates are rejected', () => {
  for (const timestamp of ['2026-02-30T12:00:00.000Z', '2026-01-01', new Date(Date.now() + 86400000).toISOString(), '1999-01-01T00:00:00.000Z']) {
    const p = point({ timestamp });
    assert.throws(() => C.normalizeRecord(record({ points: [p], position: p })));
  }
});

test('share roundtrip preserves exact coordinates while excluding private data', () => {
  const input = record({ device: '私人设备标签', extra: 'secret', phone: '123' });
  const url = C.encodeShare(input, 'https://example.com/app/?utm=drop#old');
  const parsed = new URL(url);
  assert.equal(parsed.search, '');
  const payload = JSON.parse(Buffer.from(parsed.hash.slice(5), 'base64url').toString());
  assert.deepEqual(Object.keys(payload), ['v', 'id', 'testId', 'scene', 'position']);
  assert.equal(JSON.stringify(payload).includes('私人'), false);
  const out = C.decodeShare(url);
  assert.equal(out.source, 'received');
  assert.deepEqual(out.position, input.position);
  assert.equal(out.device, '');
  assert.deepEqual(C.decodeShare(parsed.hash).position, out.position);
});

test('share permits local testing and public HTTPS only', () => {
  for (const base of ['http://localhost:8080/', 'http://127.0.0.1:3000/', 'https://example.com/']) assert.match(C.encodeShare(record(), base), /#loc=/);
  for (const base of ['file:///index.html', 'javascript:alert(1)', 'http://example.com/', 'https://192.168.1.9/', 'https://10.0.0.1/', 'https://172.16.0.1/', 'https://test.local/', 'https://intranet/', 'https://user:password@example.com/']) assert.throws(() => C.encodeShare(record(), base), base);
});

test('share decoder rejects HTML, overlong text, unknown fields and versions', () => {
  for (const change of [{ testId: '<img src=x>' }, { scene: 'a'.repeat(81) }, { id: 'a\n' }, { phone: '123' }, { v: 2 }, { position: [] }]) assert.throws(() => C.decodeShare(hash(sharePayload(change))));
});

test('share decoder rejects malformed hashes, arrays, damaged encoding and oversized payloads', () => {
  for (const input of ['', '#', '#loc=', '#loc=%', '#loc=a', '#loc=' + 'a'.repeat(5000), hash([]), hash(null), '#loc=' + Buffer.from([0xff]).toString('base64url'), '#loc=e30&extra=1']) assert.throws(() => C.decodeShare(input));
});

test('share decoder rejects malicious coordinates, nonfinite accuracy and future timestamps', () => {
  for (const change of [{ lat: '1' }, { lat: 200 }, { accuracy: null }, { accuracy: Infinity }, { crs: 'unknown' }, { timestamp: new Date(Date.now() + 86400000).toISOString() }, { other: 'unexpected' }]) assert.throws(() => C.decodeShare(hash(sharePayload({ position: point(change) }))));
});

test('WGS84 navigation has dev=1 and omits all origin parameters', () => {
  const links = C.navigationLinks(record());
  assert.equal(new URL(links.android).protocol, 'amapuri:');
  assert.equal(new URL(links.ios).protocol, 'iosamap:');
  for (const key of ['android', 'ios']) {
    const params = new URL(links[key]).searchParams;
    assert.equal(params.get('dev'), '1');
    assert.equal(params.get('t'), '0');
    assert.equal(params.get('dlat'), String(point().lat));
    assert.equal(params.get('dlon'), String(point().lon));
    for (const field of ['slat', 'slon', 'sname']) assert.equal(params.has(field), false);
  }
  const web = new URL(links.web);
  assert.equal(web.searchParams.get('coordinate'), 'wgs84');
  assert.equal(web.searchParams.get('position'), point().lon + ',' + point().lat);
  assert.equal(web.searchParams.get('callnative'), '0');
});

test('GCJ02 navigation has dev=0 and marker coordinate=gaode', () => {
  const p = point({ crs: 'GCJ02' });
  const links = C.navigationLinks(record({ position: p, points: [p] }));
  assert.equal(new URL(links.android).searchParams.get('dev'), '0');
  assert.equal(new URL(links.ios).searchParams.get('dev'), '0');
  assert.equal(new URL(links.web).searchParams.get('coordinate'), 'gaode');
});

test('different records produce different navigation destinations', () => {
  const p = point({ lat: 30, lon: 120 });
  assert.notEqual(C.navigationLinks(record()).android, C.navigationLinks(record({ id: 'other', testId: '另一个', points: [p], position: p })).android);
});

test('no-position records cannot be shared or navigated', () => {
  const input = record({ status: 'timeout', position: null, points: [] });
  assert.throws(() => C.encodeShare(input, 'https://example.com/'));
  assert.throws(() => C.navigationLinks(input));
  assert.throws(() => C.recordText(input, 'https://example.com/'));
});

test('reply text preserves interrupted status and precision explanation', () => {
  const result = C.recordText(record({ status: 'interrupted', reason: '页面退出' }), 'https://example.com/');
  assert.match(result, /中断采集/);
  assert.match(result, /不等于真实误差/);
  assert.match(result, /现场建筑和入口仍需确认/);
  assert.match(result, /#loc=/);
});

test('session requests fresh high-accuracy positions with 10 second browser timeout', () => {
  const r = rig(); r.session.start();
  assert.deepEqual(r.options, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
  assert.equal(r.session.snapshot().position, null);
  assert.equal(r.session.snapshot().status, 'running');
  r.session.stop();
});

test('no fix finishes once at 60 seconds and clears watch id zero', () => {
  const r = rig(); r.session.start(); r.tick(59999);
  assert.equal(r.results.length, 0); r.tick(1);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].status, 'timeout');
  assert.equal(r.results[0].position, null);
  assert.deepEqual(r.cleared, [0]);
  r.tick(100000); r.session.stop();
  assert.equal(r.results.length, 1);
});

test('first fix at 5 seconds includes authorization waiting and finishes at 35 seconds', () => {
  const r = rig(); r.session.start(); r.tick(5000); r.fix();
  assert.equal(r.session.snapshot().firstFixMs, 5000);
  r.tick(29999); assert.equal(r.results.length, 0);
  r.tick(1); assert.equal(r.results.length, 1);
  assert.equal(r.results[0].status, 'success');
  assert.equal(Date.parse(r.results[0].endedAt) - Date.parse(r.results[0].startedAt), 35000);
});

test('first fix at 50 seconds stops at total 60 second cap', () => {
  const r = rig(); r.session.start(); r.tick(50000); r.fix(); r.tick(10000);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].firstFixMs, 50000);
  assert.equal(r.session.snapshot().elapsedMs, 60000);
});

test('new fixes do not extend the observation window and latest exact position wins', () => {
  const r = rig(); r.session.start(); r.tick(1000); r.fix(); r.tick(20000);
  r.fix({ latitude: 31.98765432101234, longitude: 120.12345678901234, accuracy: 3.987654321 });
  r.tick(10000);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].points.length, 2);
  assert.equal(r.results[0].position.lon, 120.12345678901234);
  assert.equal(r.results[0].position.accuracy, 3.987654321);
});

test('permission denied ends immediately and ignores late fixes and errors', () => {
  const r = rig(); r.session.start(); r.tick(3500); r.error(1);
  r.fix(); r.error(3); r.tick(100000);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].status, 'denied');
  assert.equal(r.results[0].position, null);
  assert.equal(r.session.snapshot().points.length, 0);
});

test('temporary unavailability and timeout recover before deadline', () => {
  const r = rig(); r.session.start(); r.error(2); r.tick(10000); r.error(3);
  assert.equal(r.results.length, 0);
  r.tick(3000); r.fix(); r.tick(30000);
  assert.equal(r.results[0].status, 'success');
  assert.equal(r.results[0].errorCode, null);
  assert.equal(r.results[0].firstFixMs, 13000);
});

test('unavailability without a fix persists as unavailable at deadline', () => {
  const r = rig(); r.session.start(); r.error(2); r.tick(60000);
  assert.equal(r.results[0].status, 'unavailable');
  assert.equal(r.results[0].errorCode, 2);
});

test('browser timeout remains pending until total deadline', () => {
  const r = rig(); r.session.start(); r.tick(10000); r.error(3);
  assert.equal(r.results.length, 0); r.tick(50000);
  assert.equal(r.results[0].status, 'timeout');
});

test('invalid and stale callbacks are ignored but zero coordinates are retained', () => {
  const r = rig(); r.session.start();
  r.fix({ latitude: NaN }); r.fix({ accuracy: Infinity }); r.fix({}, EPOCH - 60000); r.fix({}, EPOCH - 1);
  assert.equal(r.session.snapshot().position, null);
  r.fix({ latitude: 0, longitude: 0, accuracy: 0 });
  r.session.stop();
  assert.equal(r.results[0].position.lat, 0);
  assert.equal(r.results[0].position.lon, 0);
  assert.equal(r.results[0].points.length, 1);
});

test('second failed session cannot inherit the first session position', () => {
  const first = rig(); first.session.start(); first.fix(); first.session.stop();
  const second = rig({ id: 'second' }); second.session.start(); second.error(1);
  first.fix({ latitude: 25 });
  assert.equal(second.results[0].position, null);
  assert.deepEqual(second.results[0].points, []);
  assert.equal(first.results[0].position.lat, 31.2304);
});

test('manual stop returns cancelled with no fix and success with a fix', () => {
  const a = rig(); a.session.start(); a.session.stop();
  assert.equal(a.results[0].status, 'cancelled');
  const b = rig(); b.session.start(); b.fix(); b.session.stop();
  assert.equal(b.results[0].status, 'success');
  assert.equal(b.timers.size, 0);
});

test('page exit marks interrupted and still preserves any position', () => {
  for (const hasFix of [false, true]) {
    const r = rig(); r.session.start(); if (hasFix) r.fix(); r.session.stop('interrupted');
    assert.equal(r.results[0].status, 'interrupted');
    assert.equal(Boolean(r.results[0].position), hasFix);
    r.fix(); r.tick(60000); assert.equal(r.results.length, 1);
  }
});

test('finished records normalize successfully and snapshots cannot alter state', () => {
  const r = rig(); r.session.start(); r.fix();
  const snapshot = r.session.snapshot(); snapshot.position.lat = 99; snapshot.points.length = 0;
  r.session.stop();
  assert.equal(r.results[0].position.lat, 31.2304);
  assert.equal(r.results[0].points.length, 1);
  assert.deepEqual(C.normalizeRecord(r.results[0]), r.results[0]);
});

test('start and stop are idempotent and completed session cannot restart', () => {
  const r = rig(); assert.equal(r.session.stop(), null); r.session.start(); r.session.start(); r.fix(); r.session.stop(); r.session.stop(); r.session.start();
  assert.equal(r.results.length, 1);
  assert.equal(r.session.snapshot().finished, true);
});

test('missing geolocation and startup throw produce explicit terminal records', () => {
  const a = rig({ geolocation: null }); a.session.start();
  assert.equal(a.results[0].status, 'unsupported');
  const b = rig({ geolocation: { watchPosition() { throw new Error('blocked'); } } }); b.session.start();
  assert.equal(b.results[0].status, 'unavailable');
  assert.equal(b.timers.size, 0);
});

test('synchronous permission callback still clears the subsequently returned watch handle', () => {
  const cleared = [];
  const r = rig({ geolocation: { watchPosition(ok, err) { err({ code: 1 }); return 42; }, clearWatch(id) { cleared.push(id); } } });
  r.session.start();
  assert.equal(r.results.length, 1);
  assert.deepEqual(cleared, [42]);
});

test('resuming a suspended event loop cannot admit positions past either deadline', () => {
  const a = rig(); a.session.start(); a.jump(61000); a.fix();
  assert.equal(a.results[0].status, 'timeout');
  assert.equal(a.results[0].position, null);
  const b = rig(); b.session.start(); b.tick(1000); b.fix(); b.jump(31000); b.fix({ latitude: 22 });
  assert.equal(b.results[0].status, 'success');
  assert.equal(b.results[0].position.lat, 31.2304);
  assert.equal(b.results[0].points.length, 1);
});
