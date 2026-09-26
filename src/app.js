(function () {
  'use strict';
  const C = window.LocCore;
  const $ = id => document.getElementById(id);
  const KEY = 'loc119.records.v1';
  const STATUS = { success:'已取得位置', denied:'定位被拒绝', timeout:'等待超时', unavailable:'位置不可用', cancelled:'已取消', interrupted:'定位已中断', unsupported:'无法定位', running:'定位中' };
  const REASONS = { manual:'手动结束', interrupted:'页面离开前台', hidden:'页面离开前台', deadline:'到达总等待上限', total_timeout:'到达总等待上限', sample_complete:'采样完成', observed:'采样完成', denied:'定位权限被拒绝', unsupported:'定位环境不支持' };
  let active = null, latest = null, records = [], incoming = null, ticker = null, toastTimer = null;
  let storageOK = true, storageBlocked = false, rawStorage = null;
  let knownRecords = new Map();
  const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.protocol === 'file:';
  const platform = /android/i.test(navigator.userAgent) ? 'android' : (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) ? 'ios' : 'web';
  const inWechat = /MicroMessenger|QQ\//i.test(navigator.userAgent);

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function toast(text) {
    $('toast').textContent = text; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
  }
  function prettyTime(value) {
    if (!value) return '未取得';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', {hour12:false}) : '时间无效';
  }
  function nextTestId() {
    const d = new Date();
    return 'T' + [d.getMonth()+1,d.getDate(),d.getHours(),d.getMinutes()].map(n=>String(n).padStart(2,'0')).join('') + '-' + Math.random().toString(36).slice(2,5).toUpperCase();
  }
  function setView(name) {
    $('locate-view').hidden = name !== 'locate'; $('records-view').hidden = name !== 'records';
    for (const tab of ['locate','records']) {
      if (tab === name) $('tab-'+tab).setAttribute('aria-current','page');
      else $('tab-'+tab).removeAttribute('aria-current');
    }
  }
  function updateStorageNote(message) {
    $('storage-note').hidden = storageOK && !message;
    $('storage-note').textContent = message || (storageBlocked ? '本机存储内容无法读取，已保护原始数据。新记录暂存在本页，请先导出备份；重置前可导出原始存储。' : '本机保存失败，当前记录仅暂存在本页。请立即导出；关闭或刷新页面可能丢失这些记录。');
    $('storage-recovery').hidden = !storageBlocked;
  }
  function loadRecords() {
    try {
      rawStorage = localStorage.getItem(KEY);
      if (!rawStorage) return [];
      const parsed = JSON.parse(rawStorage);
      if (!Array.isArray(parsed)) throw new Error('Invalid record list');
      const loaded = parsed.map(C.normalizeRecord);
      knownRecords = new Map(loaded.map(r=>[r.id,r]));
      return loaded;
    } catch (_) { storageOK = false; storageBlocked = true; updateStorageNote(); return []; }
  }
  function mergeRecord(existing, value) {
    if (!existing) return value;
    if (existing.testId !== value.testId || existing.scene !== value.scene || JSON.stringify(existing.position) !== JSON.stringify(value.position)) throw new Error('记录标识相同但内容不同，请核对来源。');
    if (existing.source === 'received' && value.source === 'local') return value;
    if (existing.source === 'local' && value.source === 'received') return existing;
    if (existing.source === 'local' && JSON.stringify(existing) !== JSON.stringify(value)) throw new Error('两份完整记录内容冲突，已取消写入。');
    return existing;
  }
  function mergeDisk(disk) {
    const current = new Map(records.map(r=>[r.id,r]));
    const merged = new Map(disk.map(r=>[r.id,r]));
    for (const id of knownRecords.keys()) if (!current.has(id)) merged.delete(id);
    for (const [id, value] of current) {
      const known = knownRecords.get(id);
      if (!known || JSON.stringify(known) !== JSON.stringify(value)) merged.set(id, mergeRecord(merged.get(id), value));
    }
    return Array.from(merged.values()).sort((a,b)=>new Date(b.endedAt)-new Date(a.endedAt));
  }
  function persist() {
    if (storageBlocked) { storageOK = false; updateStorageNote(); return false; }
    try {
      const raw = localStorage.getItem(KEY), disk = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(disk)) throw new Error('现有存储格式无效');
      const merged = mergeDisk(disk.map(C.normalizeRecord));
      localStorage.setItem(KEY, JSON.stringify(merged)); records = merged;
      knownRecords = new Map(records.map(r=>[r.id,r])); storageOK = true; updateStorageNote(); return true;
    } catch (_) { storageOK = false; updateStorageNote(); return false; }
  }
  function addRecord(record) {
    const value = C.normalizeRecord(record);
    const existing = records.find(r => r.id === value.id);
    if (existing) {
      const merged = mergeRecord(existing, value);
      records = records.map(r=>r.id===value.id?merged:r);
      const saved=persist(); renderRecords(); return {added:false, saved};
    }
    records.unshift(value);
    const saved = persist(); renderRecords();
    return {added:true, saved};
  }
  function deleteRecord(record) {
    if (!confirm('删除本机记录“'+record.testId+'”？已发送的短信和链接不会被删除。')) return;
    records = records.filter(r => r.id !== record.id);
    const saved = persist(); renderRecords();
    toast(saved ? '已删除本机记录。' : '本页已移除，但未能写入存储；刷新后旧记录可能重新出现。');
  }
  function downloadText(filename, text) {
    const url = URL.createObjectURL(new Blob([text], {type:'application/json;charset=utf-8'}));
    const a = el('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function exportRecords() {
    if (!records.length) { toast('还没有可导出的记录。'); return; }
    downloadText('定位接力记录-'+new Date().toISOString().slice(0,10)+'.json', JSON.stringify({format:'loc119-export',version:1,exportedAt:new Date().toISOString(),records},null,2));
    toast('已发起下载，请在浏览器下载列表确认文件。');
  }
  async function copyText(text, message) {
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text); toast(message || '已复制。请回到原短信会话粘贴，并点击发送。');
    } catch (_) {
      $('copy-text').value = text;
      if (typeof $('copy-dialog').showModal === 'function') $('copy-dialog').showModal();
      else $('copy-dialog').setAttribute('open','');
      $('copy-text').focus(); $('copy-text').select();
    }
  }
  function copyRecord(record) {
    try {
      if (location.protocol === 'file:') {
        const p = record.position;
        copyText('【定位测试 '+record.testId+'】\n测试状态：'+STATUS[record.status]+'\n采集时间：'+prettyTime(p.timestamp)+'\n坐标：'+p.lat+', '+p.lon+'（'+p.crs+'，纬度在前）\n设备报告精度：'+p.accuracy+' 米\n高德查看：'+C.navigationLinks(record).web+'\n此为测试手机位置，现场入口需确认。\n本地文件无法生成跨手机查看链接，请先发布到HTTPS网址。','已复制位置文字；本地文件不含可回传的网页链接。');
        return;
      }
      const text = C.recordText(record, location.href.split('#')[0]);
      copyText(text, localPreview ? '已复制本地预览内容。该本地链接不能给其他手机使用，请先发布到HTTPS网址。' : undefined);
    } catch (error) { toast('无法生成回传内容：'+error.message); }
  }
  function details(record) {
    const dl = el('dl',undefined,'detail-grid'), p = record.position;
    const rows = [['测试编号',record.testId],['场景',record.scene],['状态',STATUS[record.status] || record.status],['采集时间',p ? prettyTime(p.timestamp) : '未取得有效位置']];
    if (p) rows.push(['设备精度',p.accuracy.toFixed(1)+' 米（报告值）'],['原始坐标',p.lat.toFixed(6)+', '+p.lon.toFixed(6)],['坐标系',p.crs+' · 纬度在前']);
    if (record.device) rows.push(['设备备注',record.device]);
    if (record.source === 'local') rows.push(['首点耗时',record.firstFixMs === null ? '未取得' : (record.firstFixMs/1000).toFixed(1)+' 秒（含授权等待）']);
    if (record.reason) rows.push(['结束说明',REASONS[record.reason] || record.reason]);
    rows.forEach(([k,v]) => { dl.append(el('dt',k),el('dd',v)); });
    return dl;
  }
  function recordActions(record, options = {}) {
    const wrap = el('div');
    if (record.position) {
      const links = C.navigationLinks(record), nav = el('div',undefined,'navigation-actions');
      const a = el('a','高德导航','button primary'); a.href = links[platform]; a.rel = 'noreferrer noopener';
      if (platform === 'web') a.target = '_blank';
      a.addEventListener('click', () => {
        if (inWechat) toast('若未打开高德，请点右上角菜单，用系统浏览器打开本页。');
        else if (platform === 'web') toast('已打开高德网页版目标点；手机上可跳转到高德App路线界面。');
      });
      const web = el('a','网页版查看位置','button secondary'); web.href = links.web; web.target = '_blank'; web.rel = 'noreferrer noopener';
      nav.append(a,web); wrap.append(nav);
      const copy = el('button','复制回传内容','button secondary'); copy.addEventListener('click',()=>copyRecord(record));
      const actions = el('div',undefined,'inline-actions'); actions.append(copy);
      if (options.save) {
        const save = el('button','保存到本机','button secondary');
        save.addEventListener('click', () => {
          try { const result=addRecord(record); save.textContent = result.saved ? '本机已保存' : '暂存于本页'; save.disabled = result.saved; toast(!result.added ? '本机已有相同记录。' : result.saved ? '已保存到当前浏览器。' : '保存失败，已暂存于本页，请导出备份。'); }
          catch(error) { toast(error.message); }
        }); actions.append(save);
      }
      wrap.append(actions);
      wrap.append(el('p', '目的地使用本条采集位置；高德以查看者的“我的位置”为起点。入口请再核对。','helper'));
    } else wrap.append(el('p','本次没有有效位置，无法导航或复制位置回传。','helper'));
    if (options.remove) {
      const remove = el('button','删除记录','text-button danger'); remove.addEventListener('click',()=>deleteRecord(record)); wrap.append(remove);
    }
    return wrap;
  }
  function renderRecords() {
    $('record-count').textContent = records.length;
    $('clear-records').hidden = records.length === 0;
    $('records-list').replaceChildren();
    const local = records.filter(r=>r.source==='local');
    const fixes = local.filter(r=>r.position).length;
    $('records-summary').textContent = records.length ? '共 '+records.length+' 条 · 采集记录 '+local.length+' 次，其中取得有效位置 '+fixes+' 次 · 收到的位置 '+(records.length-local.length)+' 条' : '';
    if (!records.length) {
      const empty=el('div',undefined,'empty-state'); empty.append(el('strong','还没有位置记录'),el('p','完成一次定位，或打开同事发来的位置链接后保存。')); $('records-list').append(empty); return;
    }
    records.forEach(record => {
      const card=el('article',undefined,'card record-card');
      const heading=el('div',undefined,'section-heading');
      heading.append(el('h3',record.testId),el('span',record.source==='received'?'收到的位置':STATUS[record.status],'state-badge'+(!record.position?' failed':'')));
      card.append(heading,el('p',prettyTime(record.endedAt),'record-meta'),details(record),recordActions(record,{remove:true}));
      $('records-list').append(card);
    });
  }
  function renderIncoming() {
    if (!location.hash) { $('incoming-section').hidden = true; return; }
    $('incoming-section').hidden = false; $('incoming-content').replaceChildren(); incoming = null;
    try {
      incoming = C.decodeShare(location.hash);
      if (!incoming) throw new Error('未识别的位置链接');
      $('incoming-title').textContent = '收到位置 · '+incoming.testId;
      $('incoming-content').append(details(incoming),recordActions(incoming,{save:true}));
      $('incoming-content').append(el('p','这是对方提供的历史采集位置，不是实时共享；请确认编号、采集时间和现场入口。','helper'));
    } catch (_) {
      $('incoming-title').textContent = '位置链接不完整或无效';
      $('incoming-content').append(el('p','请让发送者重新复制整段回传内容。未导入任何位置，也不会使用本机旧位置替代。','notice error'));
    }
  }
  function lockForm(locked) {
    $('test-id').disabled=locked; $('device-label').disabled=locked; $('scene-fieldset').disabled=locked;
    $('start').hidden=locked; $('stop').hidden=!locked;
  }
  function showProgress(snapshot) {
    const p=snapshot.position, elapsed=Math.max(0,snapshot.elapsedMs || 0);
    $('accuracy-value').textContent=p ? String(Math.round(p.accuracy)) : '—';
    $('elapsed-value').textContent=Math.floor(elapsed/1000)+' 秒';
    $('fix-count').textContent=snapshot.points.length+' 次';
    $('progress-fill').style.width=Math.min(100,elapsed/600)+'%';
    $('session-state').textContent='定位中'; $('session-state').className='state-badge';
    $('session-message').textContent=p ? '已取得位置，继续观察更新。页面保持在前台，结束后自动记录。' : '请允许浏览器访问位置。尚未收到有效位置，最多等待 60 秒。';
  }
  function finish(record) {
    active=null; latest=record; clearInterval(ticker); ticker=null; lockForm(false);
    $('start').textContent='开始新一次定位';
    $('session-state').textContent=STATUS[record.status] || '已结束';
    $('session-state').className='state-badge'+(!record.position?' failed':'');
    $('accuracy-value').textContent=record.position?String(Math.round(record.position.accuracy)):'—';
    $('fix-count').textContent=record.points.length+' 次';
    const duration=Math.max(0,new Date(record.endedAt)-new Date(record.startedAt));
    $('elapsed-value').textContent=(duration/1000).toFixed(1)+' 秒';
    $('progress-fill').style.width=Math.min(100,duration/600)+'%';
    let result;
    try { result=addRecord(record); } catch(error) { toast('记录校验失败：'+error.message); result={saved:false}; }
    const messages={denied:'定位被拒绝。请检查系统定位服务和浏览器的网站位置权限，再开始新一次测试。',timeout:'等待结束，未收到有效位置。请检查定位权限和网络，换到安全、开阔的位置重试。',unavailable:'手机未能提供有效位置。请检查定位服务，再到安全、开阔的位置重试。',cancelled:'已结束，本次没有有效位置。',interrupted:'页面离开前台，本次定位已结束。返回后可开始新一次测试。',unsupported:'当前页面无法使用定位。请用系统浏览器打开独立的 HTTPS 网址。'};
    $('session-message').textContent=(messages[record.status] || '本次定位结束。可复制回传内容，回到原短信会话发送。')+(result.saved?' 已自动记录。':' 未能持久保存，请导出备份。');
    $('current-result').hidden=false; $('current-result').replaceChildren(details(record),recordActions(record));
  }
  function start() {
    if (active) return;
    let testId=$('test-id').value.trim(); if (!testId) testId=nextTestId();
    if (/[<>\u0000-\u001f]/.test(testId)) { toast('测试编号请使用普通文字、字母或数字。'); $('test-id').focus(); return; }
    $('test-id').value=testId; latest=null;
    $('accuracy-value').textContent='—'; $('elapsed-value').textContent='0 秒'; $('fix-count').textContent='0 次'; $('progress-fill').style.width='0%';
    $('current-result').replaceChildren(); $('current-result').hidden=true; lockForm(true);
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'r-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    const options={id,geolocation:window.isSecureContext?navigator.geolocation:null,testId,scene:document.querySelector('input[name=scene]:checked').value,device:$('device-label').value.trim(),onUpdate:showProgress,onFinish:finish};
    try { active=C.createSession(options); active.start(); }
    catch(error) { active=null; lockForm(false); $('session-state').textContent='无法开始'; $('session-message').textContent='未能开始定位：'+error.message; return; }
    if (active) ticker=setInterval(()=>{if(active)showProgress(active.snapshot());},250);
  }
  async function importRecords(event) {
    const file=event.target.files && event.target.files[0]; event.target.value=''; if(!file)return;
    try {
      if(file.size>8*1024*1024)throw new Error('文件超过8MB，请拆分后导入。');
      const data=JSON.parse(await file.text());
      const input=Array.isArray(data)?data:(data && data.format==='loc119-export' && data.version===1?data.records:null);
      if(!Array.isArray(input))throw new Error('请选择本工具导出的记录JSON文件。');
      const valid=input.map(C.normalizeRecord);
      const merged=new Map(records.map(r=>[r.id,r])); let count=0;
      valid.forEach(r=>{const existing=merged.get(r.id);const next=mergeRecord(existing,r);merged.set(r.id,next);if(!existing||next!==existing)count++;});
      records=Array.from(merged.values()).sort((a,b)=>new Date(b.endedAt)-new Date(a.endedAt));
      const saved=persist(); renderRecords(); toast('已导入或补全 '+count+' 条记录。'+(saved?'':'本机保存失败，请导出备份。'));
    }catch(error){toast('导入失败：'+error.message);}
  }

  $('tab-locate').addEventListener('click',()=>setView('locate'));
  $('tab-records').addEventListener('click',()=>setView('records'));
  $('start').addEventListener('click',start);
  $('stop').addEventListener('click',()=>{if(active)active.stop('manual');});
  $('export').addEventListener('click',exportRecords);
  $('import').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',importRecords);
  $('clear-records').addEventListener('click',()=>{if(confirm('清空当前浏览器全部 '+records.length+' 条记录？建议先导出备份。')){records=[];const saved=persist();renderRecords();toast(saved?'本机记录已清空。':'本页已清空，但未能写入存储；刷新后旧记录可能重新出现。');}});
  $('close-incoming').addEventListener('click',()=>{$('incoming-section').hidden=true;try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}incoming=null;});
  $('recover-storage').addEventListener('click',()=>downloadText('定位接力原始存储备份.json',rawStorage===null?'null':rawStorage));
  $('reset-storage').addEventListener('click',()=>{if(confirm('确认已备份后再重置。此操作会用本页当前记录替换原始损坏数据。')){try{localStorage.removeItem(KEY);knownRecords=new Map();storageBlocked=false;}catch(_){}const saved=persist();toast(saved?'已重置本机存储。':'仍无法写入，请导出当前记录。');}});
  window.addEventListener('storage', event => {
    if(event.key!==KEY || storageBlocked)return;
    try {
      const raw=localStorage.getItem(KEY), disk=raw?JSON.parse(raw):[];
      if(!Array.isArray(disk))throw new Error('Invalid shared storage');
      const valid=disk.map(C.normalizeRecord);
      records=mergeDisk(valid);knownRecords=new Map(valid.map(r=>[r.id,r]));renderRecords();
    }catch(_){storageOK=false;updateStorageNote('另一个页面修改了记录，但内容无法读取。当前记录仍保留在本页，请导出备份。');}
  });
  window.addEventListener('hashchange',renderIncoming);
  window.addEventListener('pagehide',()=>{if(active)active.stop('interrupted');});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&active)active.stop('interrupted');});
  $('test-id').value=nextTestId();
  const notes=[];
  if(localPreview)notes.push('当前为本地预览。跨手机回传请先发布到 HTTPS 网址；电脑上的预览不能代替手机现场定位测试。');
  else if(!window.isSecureContext)notes.push('当前网址不是安全连接，定位可能不可用。请使用 HTTPS 网址。');
  if(window.self!==window.top)notes.push('当前在嵌入页面中，父页面可能限制定位。请在系统浏览器中独立打开本页。');
  if(inWechat)notes.push('微信或QQ可能限制定位和高德跳转。建议点右上角菜单，使用系统浏览器打开。');
  if(notes.length){$('environment-note').textContent=notes.join(' ');$('environment-note').hidden=false;}
  records=loadRecords(); renderRecords(); renderIncoming();
})();
