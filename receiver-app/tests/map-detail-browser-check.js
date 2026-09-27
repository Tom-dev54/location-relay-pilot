// Read-only browser fixtures around a public district; no positions are submitted.
async page=>{
 const c=await page.context().browser().newContext({viewport:{width:615,height:622},deviceScaleFactor:2}),p=await c.newPage(),checks=[],errors=[];
 const now=Date.now(),rows=[{id:'detail-a',label:'地图显示测试 A',lat:13.9168,lon:100.581,crs:'WGS84',accuracy:17,captured_at:now,received_at:now,revision:0,mode:'auto'},{id:'detail-b',label:'地图显示测试 B',lat:13.9175,lon:100.582,crs:'WGS84',accuracy:17,captured_at:now,received_at:now,revision:0,mode:'auto'}];
 try{
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/public-positions',r=>r.fulfill({json:{records:rows}}));
 await p.route('**/api/world-map/place?*',r=>r.fulfill({json:{place:{title:'显示测试地点',address:'测试地图样式',relative:''}}}));
 await p.goto('http://127.0.0.1:8791/');
 await p.waitForFunction(()=>{const t=document.querySelector('.maplibregl-ctrl-scale')?.textContent;return t&&!t.includes('km');},{},{timeout:45000});await p.waitForTimeout(1500);
 await p.locator('.map-viewport').scrollIntoViewIfNeeded();
 if(await p.locator('.relay-map-point.is-selected').count()!==1)throw Error('Selected marker missing or duplicated');
 const tip=await p.locator('.map-engine').evaluate(e=>{const b=e.getBoundingClientRect(),m=e.querySelector('.relay-map-point.is-selected').getBoundingClientRect();return Math.hypot(m.x+m.width/2-b.x-b.width/2,m.bottom-b.y-b.height/2);});if(tip>3)throw Error('Marker tip not at coordinate '+tip);checks.push({tipOffsetPx:tip});
 await p.locator('.relay-map-point[data-point-id="detail-b"]').click();await p.waitForTimeout(800);
 if(await p.locator('.relay-map-point[data-point-id="detail-b"]').getAttribute('aria-pressed')!=='true')throw Error('Click did not select');checks.push('点选标记更新记录及选中样式');
 const switchedTip=await p.locator('.map-engine').evaluate(e=>{const b=e.getBoundingClientRect(),m=e.querySelector('.relay-map-point.is-selected').getBoundingClientRect();return Math.hypot(m.x+m.width/2-b.x-b.width/2,m.bottom-b.y-b.height/2);});if(switchedTip>3)throw Error('Switched marker tip shifted '+switchedTip);checks.push({switchedTipOffsetPx:switchedTip});
 await p.locator('.maplibregl-ctrl-zoom-out').click();await p.waitForTimeout(600);await p.locator('.maplibregl-ctrl-zoom-out').click();await p.waitForTimeout(2500);
 await p.locator('.map-viewport').screenshot({path:'output/playwright/v22-overseas-district.png'});
 checks.push({scale:await p.locator('.maplibregl-ctrl-scale').innerText()});
 await p.getByRole('button',{name:'显示测试地点'}).count();
 // Force vector rejection on a separate context to verify the compatible engine.
 const q=await c.newPage();await q.addInitScript(()=>{const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).includes('webgl'))return null;return orig.call(this,type,...args);};});
 await q.route('**/api/public-positions',r=>r.fulfill({json:{records:rows}}));await q.route('**/api/world-map/place?*',r=>r.fulfill({json:{place:{title:'显示测试地点',address:'',relative:''}}}));
 await q.goto('http://127.0.0.1:8791/');await q.locator('.leaflet-container .relay-map-point.is-selected').waitFor({timeout:20000});checks.push('兼容地图使用相同标记');await q.close();
 if(errors.length)throw Error(JSON.stringify(errors));return {checks,errors};
 }finally{await p.unrouteAll({behavior:'ignoreErrors'});await c.close();}
}
