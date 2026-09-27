// Browser-only fixtures: requests are intercepted; no position is submitted.
async page=>{
 const origin='http://127.0.0.1:8791',checks=[],browser=page.context().browser();
 const now=Date.now(),rows=[{id:'arrival-a',label:'浏览器显示测试',lat:13.75,lon:100.5,crs:'WGS84',accuracy:17,captured_at:now,received_at:now,revision:0,mode:'auto'},{id:'arrival-b',label:'第二个显示测试点',lat:13.754,lon:100.5,crs:'WGS84',accuracy:17,captured_at:now,received_at:now,revision:0,mode:'auto'}];
 for(const mode of ['tap','switch','reduced']){
  const c=await browser.newContext({viewport:{width:619,height:622},reducedMotion:mode==='reduced'?'reduce':'no-preference'}),p=await c.newPage();
  try{
   await p.addInitScript(()=>{window.__cameraSamples=[];let start=0;const frame=t=>{const el=document.querySelector('.map-engine[data-renderer=vector]');if(el){if(!start)start=t;window.__cameraSamples.push({ms:t-start,phase:el.dataset.motion,scale:document.querySelector('.maplibregl-ctrl-scale')?.textContent,transform:el.querySelectorAll('.relay-map-point')[1]?.style.transform});}if(!start||t-start<18000)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/api/public-positions',r=>r.fulfill({json:{records:rows}}));
   await p.route('**/api/world-map/place?*',r=>r.fulfill({json:{place:{title:'显示测试地点',address:'仅为浏览器显示验证',relative:''}}}));
   await p.route('**/api/world-map/vector/14/**',async r=>{try{await p.waitForTimeout(2500);await r.continue();}catch{}});
   await p.goto(origin);await p.locator('.map-engine[data-renderer="vector"]').waitFor({timeout:20000});
   await p.locator('.map-viewport').scrollIntoViewIfNeeded();
   const canvas=p.locator('.maplibregl-canvas');
   if(mode==='tap'){await canvas.click({position:{x:220,y:100},force:true});await p.mouse.wheel(0,0);}
   if(mode==='switch'){await p.locator('[data-record-id="arrival-b"]').click();await p.locator('.map-viewport').scrollIntoViewIfNeeded();}
   if(mode==='manual'){await p.waitForTimeout(350);await p.locator('.maplibregl-ctrl-zoom-in').click();}
   await p.waitForTimeout(9500);
   await p.waitForFunction(()=>{const t=document.querySelector('.maplibregl-ctrl-scale')?.textContent;return t&&!t.includes('km');},{},{timeout:25000});
   const geometry=await p.evaluate(()=>{const host=document.querySelector('.map-engine'),rect=host.getBoundingClientRect(),selected=document.querySelector('.public-record.selected')?.getAttribute('data-record-id');return {scale:document.querySelector('.maplibregl-ctrl-scale')?.textContent,phase:host.dataset.motion,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},points:[...host.querySelectorAll('.relay-map-point')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.bottom};}),selected};});
   if(mode==='manual'){if(!geometry.scale.includes('km'))throw Error('Manual override was stolen '+JSON.stringify(geometry));checks.push('主动点击缩放控件后不强行接管用户视角');}
   else{if(geometry.scale.includes('km')||parseFloat(geometry.scale)>200)throw Error('Camera stranded at overview '+JSON.stringify(geometry));const point=geometry.points[mode==='switch'?1:0],r=geometry.rect;if(Math.hypot(point.x-r.x-r.width/2,point.y-r.y-r.height/2)>35)throw Error('Wrong destination center '+JSON.stringify(geometry));checks.push({mode,scale:geometry.scale,centered:true});}
   if(mode==='tap'){const samples=await p.evaluate(()=>window.__cameraSamples);const moving=samples.filter(x=>x.phase==='zooming');if(!samples.some(x=>/km/.test(x.scale||'')&&parseFloat(x.scale)>=100)||new Set(moving.map(x=>x.transform)).size<3)throw Error('No real overview-to-point transition');checks.push({animation:'country-to-point',intermediatePositions:new Set(moving.map(x=>x.transform)).size});}
   const text=await p.locator('body').innerText();if(/先看所在区域|准备目的地细节|补充地图细节|中文＋原名；|无中文译名的地点显示/.test(text))throw Error('Technical copy still present');
   if(errors.length)throw Error(JSON.stringify(errors));
   if(mode==='tap')await p.locator('.map-pane').screenshot({path:'output/playwright/v21-arrival-final.png'});
  }finally{await p.unrouteAll({behavior:'ignoreErrors'});await c.close();}
 }
 return {checks};
}
