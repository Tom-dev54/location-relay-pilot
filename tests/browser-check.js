async (page) => {
  const base = 'http://127.0.0.1:8765/';
  const key = 'loc119.records.v1';
  const checks = [];
  const check = (value, name) => { if (!value) throw new Error('FAIL: ' + name); checks.push(name); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const setup = () => {
    window.__geo = {calls:[],cleared:[]};
    Object.defineProperty(navigator, 'geolocation', {configurable:true,value:{
      watchPosition(success,error,options) { const id=window.__geo.calls.length;window.__geo.calls.push({success,error,options});return id; },
      clearWatch(id) {window.__geo.cleared.push(id);}
    }});
    Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async()=>{throw new Error('Synthetic clipboard denial');}}});
    window.__emit = (index, lat=22.63, lon=110.15) => window.__geo.calls[index].success({timestamp:Date.now(),coords:{latitude:lat,longitude:lon,accuracy:20.4}});
  };
  await page.context().addInitScript(setup);
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.clock.install({time:new Date()});
  await page.setViewportSize({width:390,height:844});
  check(await page.title()==='定位接力 · 同事模拟测试', 'page loads');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'mobile layout has no horizontal overflow');
  await page.screenshot({path:'output/playwright/mobile-initial.png',fullPage:true});
  await page.locator('#test-id').fill('TEST-A');
  await page.getByRole('button',{name:'开始定位',exact:true}).click();
  check(await page.locator('#test-id').isDisabled(), 'metadata locked during session');
  await page.clock.fastForward(1000);
  await page.evaluate(()=>window.__emit(0));
  await page.clock.fastForward(30010);
  let records=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  check(records.length===1&&records[0].status==='success', 'first session automatically saved');
  check(records[0].position.accuracy===20.4&&records[0].firstFixMs>=1000&&records[0].firstFixMs<2000, 'raw accuracy and first-fix time preserved');
  check(await page.locator('#session-message').innerText().then(t=>t.includes('已自动记录')), 'success message matches persistence');
  const original=records[0];
  await page.locator('#current-result').getByRole('button',{name:'复制回传内容'}).click();
  check(await page.locator('#copy-dialog').isVisible(), 'clipboard rejection opens manual copy');
  const reply=await page.locator('#copy-text').inputValue();
  const share=reply.match(/https?:\/\/\S+#loc=[A-Za-z0-9_-]+/)[0];
  check(reply.includes('TEST-A')&&share.includes('#loc='), 'reply contains matched test id and portable location');
  await page.getByRole('button',{name:'完成',exact:true}).click();

  await page.locator('#test-id').fill('TEST-B');
  await page.locator('#start').click();
  check(await page.locator('#accuracy-value').innerText()==='—', 'new session clears old accuracy');
  check(await page.locator('#current-result').isHidden(), 'new session clears old navigation and copy controls');
  await page.evaluate(()=>{window.__geo.calls[1].error({code:1});window.__emit(0,10,20);});
  records=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const failed=records.find(r=>r.testId==='TEST-B');
  check(records.length===2&&failed.status==='denied'&&failed.position===null, 'second refusal saved without first position');
  check(await page.locator('#current-result a').count()===0, 'failed record has no navigation');
  check(records.find(r=>r.testId==='TEST-A').position.lat===22.63, 'late callback cannot mutate completed record');

  await page.locator('#test-id').fill('TEST-TIMEOUT');await page.locator('#start').click();
  await page.clock.fastForward(60010);
  records=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  check(records.find(r=>r.testId==='TEST-TIMEOUT').status==='timeout','60-second no-fix timeout leaves a record');
  await page.locator('#test-id').fill('TEST-CANCEL');await page.locator('#start').click();await page.locator('#stop').click();
  records=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  check(records.find(r=>r.testId==='TEST-CANCEL').status==='cancelled','manual stop without position leaves a record');
  await page.locator('#test-id').fill('TEST-INTERRUPT');await page.locator('#start').click();
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  records=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  check(records.find(r=>r.testId==='TEST-INTERRUPT').status==='interrupted','page exit leaves an interrupted record');

  const browser=page.context().browser();
  const receiverContext=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  await receiverContext.addInitScript(setup);
  const receiver=await receiverContext.newPage();
  receiver.on('pageerror',error=>errors.push(error.message));
  await receiver.goto(share);
  check(await receiver.locator('#incoming-title').innerText()==='收到位置 · TEST-A','another browser previews received record');
  const iosHref=await receiver.locator('#incoming-content').getByRole('link',{name:'高德导航',exact:true}).getAttribute('href');
  const iosParams=await receiver.evaluate(href=>Object.fromEntries(new URL(href).searchParams),iosHref);
  check(iosHref.startsWith('iosamap://path?')&&iosParams.dev==='1','iPhone route uses WGS84 dev=1');
  check(!('slat' in iosParams)&&!('slon' in iosParams)&&!('sname' in iosParams),'route leaves origin to Amap current location');
  check(iosParams.dlat==='22.63'&&iosParams.dlon==='110.15','route carries correct destination');
  await receiver.getByRole('button',{name:'保存到本机',exact:true}).click();
  await receiver.reload();
  check(await receiver.locator('#record-count').innerText()==='1','received record survives refresh');
  await receiver.getByRole('button',{name:/位置记录/}).click();
  const importData=async(data)=>receiver.evaluate(payload=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(payload)],'records.json',{type:'application/json'}));const input=document.getElementById('import-file');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));},data);
  await importData({format:'loc119-export',version:1,records:[original]});
  await receiver.waitForFunction(k=>JSON.parse(localStorage.getItem(k))[0].source==='local',key);
  let received=await receiver.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  check(received.length===1&&received[0].firstFixMs===original.firstFixMs,'full JSON upgrades a saved share without duplicate');
  const conflict=JSON.parse(JSON.stringify(original));conflict.scene='室内深处';
  await importData([conflict]);
  await receiver.waitForFunction(()=>document.getElementById('toast').textContent.includes('导入失败'));
  received=await receiver.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  check(received[0].scene===original.scene,'conflicting import leaves existing records unchanged');
  const downloadPromise=receiver.waitForEvent('download');await receiver.locator('#export').click();const download=await downloadPromise;
  check(download.suggestedFilename().endsWith('.json'),'records export downloads JSON');

  const second=JSON.parse(JSON.stringify(original));second.id='other-id';second.testId='TEST-OTHER';second.position={...second.position,lat:23.11,lon:111.22};second.points=[second.position];
  const secondShare=await receiver.evaluate(r=>LocCore.encodeShare(r,location.href),second);
  const otherTab=await receiverContext.newPage();await otherTab.goto(secondShare);
  await otherTab.getByRole('button',{name:'保存到本机',exact:true}).click();
  await receiver.waitForFunction(()=>document.getElementById('record-count').textContent==='2');
  check(await receiver.locator('#record-count').innerText()==='2','saving another SMS tab synchronizes records');
  await receiver.locator('#close-incoming').click();
  receiver.once('dialog',dialog=>dialog.accept());
  await receiver.locator('.record-card').filter({has:receiver.getByRole('heading',{name:'TEST-A',exact:true})}).getByRole('button',{name:'删除记录',exact:true}).click();
  await otherTab.waitForFunction(()=>document.getElementById('record-count').textContent==='1');
  check(await otherTab.locator('#record-count').innerText()==='1','deletion synchronizes without reviving stale records');
  await otherTab.close();
  await receiver.goto(base+'#loc=INVALID');
  check(await receiver.locator('#incoming-title').innerText()==='位置链接不完整或无效','malformed share shows explicit error');
  check(await receiver.locator('#incoming-content a').count()===0,'malformed share cannot navigate');
  await receiverContext.close();

  const androidContext=await browser.newContext({viewport:{width:393,height:851},userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 MicroMessenger/8.0'});
  const android=await androidContext.newPage();await android.goto(share);
  const androidHref=await android.locator('#incoming-content').getByRole('link',{name:'高德导航',exact:true}).getAttribute('href');
  check(androidHref.startsWith('amapuri://route/plan/?'),'Android route uses official URI');
  check(await android.locator('#environment-note').innerText().then(t=>t.includes('微信')),'WeChat gets system-browser guidance');
  await android.screenshot({path:'output/playwright/mobile-received.png',fullPage:true});
  await androidContext.close();

  const quotaContext=await browser.newContext();await quotaContext.addInitScript(setup);
  await quotaContext.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic full storage','QuotaExceededError');};});
  const quota=await quotaContext.newPage();await quota.goto(base);await quota.locator('#test-id').fill('TEST-QUOTA');await quota.locator('#start').click();await quota.evaluate(()=>window.__emit(0));await quota.locator('#stop').click();
  check(await quota.locator('#storage-note').isVisible(),'storage quota failure is visible');
  check(await quota.locator('#session-message').innerText().then(t=>!t.includes('已自动记录')&&t.includes('未能持久保存')),'quota failure never falsely claims saved');
  check(await quota.locator('#record-count').innerText()==='1','quota-failed record remains available for export');
  await quotaContext.close();

  await page.reload();await page.locator('#tab-records').click();
  check(await page.locator('#record-count').innerText()==='5','success and all failures survive reload');
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/desktop-records.png',fullPage:true});
  check(errors.length===0,'no JavaScript page errors: '+errors.join('; '));
  return {passed:checks.length,checks};
}
