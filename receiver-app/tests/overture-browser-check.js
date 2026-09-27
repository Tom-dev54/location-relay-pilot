// Public neighborhood display fixture; intercept records locally, never submit.
async page=>{
 const c=await page.context().browser().newContext({viewport:{width:615,height:850},deviceScaleFactor:2}),p=await c.newPage(),checks=[],errors=[],tiles=[];
 const now=Date.now(),records=[{id:'overture-check',label:'地图显示检查',lat:13.9168,lon:100.581,crs:'WGS84',accuracy:17,captured_at:now,received_at:now,revision:0,mode:'auto'}];
 try{
 p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/overture/'))tiles.push({path:r.url().split('/api/')[1],status:r.status()});});
 await p.route('**/api/public-positions',r=>r.fulfill({json:{records}}));
 await p.route('**/api/world-map/place?*',r=>r.fulfill({json:{place:{title:'廊曼西侧城区',address:'地图数据验证',relative:''}}}));
 const start=Date.now();await p.goto('http://127.0.0.1:8791/');await p.locator('.maplibregl-canvas').waitFor({timeout:20000});
 await p.waitForFunction(()=>document.querySelector('.map-engine')?.getAttribute('data-motion')==='ready',{},{timeout:50000});
 await p.waitForTimeout(1500);if(!tiles.some(t=>t.path.includes('/buildings/')&&t.status===200)||!tiles.some(t=>t.path.includes('/places/')&&t.status===200))throw Error('Supplement did not load '+JSON.stringify(tiles));checks.push({readyMs:Date.now()-start,feedback:await p.locator('.map-feedback').allTextContents()});
 await p.locator('.map-viewport').scrollIntoViewIfNeeded();await p.locator('.map-viewport').screenshot({path:'output/playwright/v24-overseas-buildings.png'});
 await p.locator('.maplibregl-ctrl-zoom-out').click();await p.waitForTimeout(700);await p.locator('.maplibregl-ctrl-zoom-out').click();await p.waitForTimeout(3000);
 await p.locator('.map-viewport').screenshot({path:'output/playwright/v24-overseas-district.png'});
 checks.push({districtScale:await p.locator('.maplibregl-ctrl-scale').innerText(),marker:await p.locator('.relay-map-point.is-selected').count()});
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(1000);await p.locator('.map-viewport').screenshot({path:'output/playwright/v24-overseas-mobile.png'});
 if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile overflow');
 if(!await p.getByRole('link',{name:'高德导航',exact:true}).count())throw Error('Amap button missing');
 // Simulate supplemental server failure. Existing streets/map/navigation must survive.
 await p.route('**/api/world-map/overture/**',r=>r.fulfill({status:502,body:''}));await p.reload();await p.waitForFunction(()=>document.querySelector('.map-engine')?.getAttribute('data-motion')==='ready',{},{timeout:40000});
 checks.push({supplementFailureStillReady:await p.locator('.map-engine').getAttribute('data-motion')==='ready',failureFeedback:await p.locator('.map-feedback').allTextContents()});
 await p.goto('http://127.0.0.1:8791/send');if(await p.getByRole('link',{name:'公开测试看板'}).count())throw Error('Sender board link exposed');
 if(errors.length)throw Error(JSON.stringify(errors));return {checks,tiles,errors};
 }finally{await p.unrouteAll({behavior:'ignoreErrors'});await c.close();}
}
