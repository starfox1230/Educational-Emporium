// Run with Playwright and its WebKit/Chromium browsers installed:
// node apps/sight-words/tests/minigames.test.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const playwright = require(process.env.SIGHT_WORDS_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const name = path.basename(new URL(req.url, 'http://localhost').pathname) || 'index.html';
  const file = path.join(root, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404);res.end();return; }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/json');
  res.end(fs.readFileSync(file));
});
const order = page => page.evaluate(() => JSON.parse(localStorage.getItem('miniGameOrder')));
const named = (page, text) => page.getByRole('button', {name:text,exact:true});
async function safeBounds(page, selector, width, height, insets) {
  const r = await page.locator(selector).evaluate(e => {
    const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
  });
  assert(r.left>=insets.side-1 && r.right<=width-insets.side+1, `${selector} clips horizontally: ${JSON.stringify(r)}`);
  assert(r.top>=insets.top-1 && r.bottom<=height-insets.bottom+1, `${selector} clips vertically: ${JSON.stringify(r)}`);
}
async function openEditor(page) {await page.locator('#edit-minigames-btn').click();}
async function addGame(page, id) {await page.locator(`.lineup-library-card[data-game-id="${id}"]`).getByRole('button',{name:/Add/}).click();}
async function saveName(page, name) {
  const manage=page.locator('#lineup-save-menu');
  if(!await manage.evaluate(e=>e.open)) await manage.locator('summary').click();
  await page.locator('.lineup-name').fill(name);
  await named(page,'Save lineup').click();
}
async function lineupChecks(page) {
  assert.deepEqual(await order(page), ['catRescue','balloonPop'], 'migration must preserve removed games');
  assert.equal(await page.evaluate(()=>MINI_GAME_LIBRARY.length),32);
  assert.equal(await page.evaluate(()=>SIGHT_WORDS_EXTRA_GAMES.length),20);
  await openEditor(page);
  await named(page,'New lineup').click();
  assert.deepEqual(await order(page),[]);
  await page.locator('.lineup-category').selectOption('new');
  assert.equal(await page.locator('.lineup-library-card').count(),20);
  await page.locator('.lineup-search').fill('rocket');
  assert.equal(await page.locator('.lineup-library-card').count(),1);
  await addGame(page,'rocketLaunch');
  await page.locator('.lineup-search').fill('');
  await addGame(page,'monsterMatch');
  await addGame(page,'musicMaker');
  await page.getByRole('tab',{name:/My lineup/}).click();
  await page.getByRole('tab',{name:/Browse games/}).click();
  await addGame(page,'rocketLaunch');
  await page.getByRole('tab',{name:/My lineup/}).click();
  assert.deepEqual(await order(page),['rocketLaunch','monsterMatch','musicMaker','rocketLaunch']);
  assert.equal(await page.locator('.lineup-order-card select').count(),0,'no position menus');
  assert.equal(await page.locator('.lineup-order-card button').count(),8,'only a grip and remove button per row');
  // Drag a duplicate by its own row index; observe the live gap before dropping.
  const last=page.locator('.lineup-drag-handle').last();
  const a=await last.boundingBox(), b=await page.locator('.lineup-order-card').first().boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  assert.equal(await page.locator('.lineup-drag-ghost').count(),1);
  assert.equal(await page.locator('.lineup-drop-slot').count(),1);
  await page.mouse.move(b.x+25,b.y+4,{steps:12});await page.waitForTimeout(120);
  assert.equal(await page.locator('.lineup-drop-slot').evaluate(e=>e.nextElementSibling.dataset.index),'0','visible insertion gap');
  assert.deepEqual(await order(page),['rocketLaunch','monsterMatch','musicMaker','rocketLaunch'],'drag preview must not save early');
  await page.mouse.up();await page.waitForTimeout(160);
  assert.equal(await page.locator('.lineup-drag-ghost').count(),0);
  assert.deepEqual(await order(page),['rocketLaunch','rocketLaunch','monsterMatch','musicMaker'],'pointer reorder');
  await page.locator('.lineup-order-card').first().locator('.lineup-row-remove').click();
  assert.deepEqual(await order(page),['rocketLaunch','monsterMatch','musicMaker']);
  await page.locator('.lineup-drag-handle').last().press('ArrowUp');
  assert.deepEqual(await order(page),['rocketLaunch','musicMaker','monsterMatch'],'keyboard reorder');
  await saveName(page,'Family Favorites');
  await page.locator('#minigame-interval-input').fill('3');await page.locator('#minigame-interval-input').blur();
  const favoriteId=await page.locator('.lineup-saved-select').inputValue();
  await named(page,'New lineup').click();
  await addGame(page,'pirateTreasure');
  await saveName(page,'Adventure');
  await page.locator('.lineup-saved-select').selectOption(favoriteId);
  assert.deepEqual(await order(page),['rocketLaunch','musicMaker','monsterMatch']);
  assert.equal(await page.locator('#minigame-interval-input').inputValue(),'3');
  // Previewing both new and legacy games must leave quiz points and lineup rotation alone.
  const before=await page.evaluate(()=>({score,index:currentMiniGameIdx,order:[...miniGameOrder]}));
  await page.getByRole('tab',{name:/Browse games/}).click();
  await page.locator('.lineup-category').selectOption('all');
  for(const id of ['rocketLaunch','catRescue']) {
    await page.locator(`.lineup-library-card[data-game-id="${id}"]`).getByRole('button',{name:/^Try /}).click();
    await page.locator('#minigame-preview-back').click();
    assert.equal(await page.locator('#minigame-preview-back').count(),0);
  }
  assert.deepEqual(await page.evaluate(()=>({score,index:currentMiniGameIdx,order:[...miniGameOrder]})),before);
  await page.getByRole('tab',{name:/My lineup/}).click();
  await page.locator('.lineup-order-card').first().locator('.lineup-row-remove').click();
  await named(page,'↶ Undo').click();
  assert.deepEqual(await order(page),before.order);
  if(!await page.locator('#lineup-save-menu').evaluate(e=>e.open)) await page.locator('#lineup-save-menu summary').click();
  await named(page,'Clear lineup').click();
  await page.reload({waitUntil:'load'});
  assert.deepEqual(await order(page),[],'empty lineup must survive reload');
  await openEditor(page);
  assert.equal(await page.locator('.lineup-saved-select').inputValue(),favoriteId);
  await page.locator('#lineup-save-menu summary').click();
  await named(page,'All games').click();
  assert.equal((await order(page)).length,32);
  await named(page,'↶ Undo').click();assert.deepEqual(await order(page),[]);
  await named(page,'Delete saved lineup').click();
  assert.equal(await page.locator('.lineup-saved-select option').count(),2);
  await named(page,'↶ Undo').click();
  assert.equal(await page.locator('.lineup-saved-select option').count(),3);
  await page.getByRole('tab',{name:/Browse games/}).click();
  await page.locator('#lineup-save-menu summary').click();
  await addGame(page,'monsterMatch');await addGame(page,'musicMaker');await addGame(page,'treasureTrail');
  await page.reload({waitUntil:'load'});
  assert.deepEqual(await order(page),['monsterMatch','musicMaker','treasureTrail']);
  console.log('PASS named lineups, migration, duplicates, drag, keyboard, search, undo, presets, preview, reload');
}
async function start(page,id,random=0.1,duration=20000) {
  await page.evaluate(({id,random,duration})=> {
    Math.random=()=>random;
    const entry=SIGHT_WORDS_EXTRA_GAMES.find(g=>g.id===id);
    window.testGame=entry.game;window.completions=[];
    testGame.duration=duration;
    document.querySelector('#minigame-config-modal').classList.remove('visible');
    document.querySelector('#minigame-area').classList.add('active');
    testGame.start(document.querySelector('#minigame-area'),points=>completions.push(points));
  },{id,random,duration});
}
async function editorLayoutChecks(page,engine) {
  for(const c of [
    {width:320,height:568,top:0,bottom:0,side:0},
    {width:390,height:844,top:47,bottom:34,side:0},
    {width:844,height:390,top:0,bottom:21,side:47},
  ]) {
    await page.setViewportSize({width:c.width,height:c.height});
    await page.addStyleTag({content:`:root{--safe-top:${c.top}px;--safe-bottom:${c.bottom}px;--safe-left:${c.side}px;--safe-right:${c.side}px;}`});
    await openEditor(page);
    await safeBounds(page,'.minigame-config-content',c.width,c.height,c);
    const rows=page.locator('.lineup-order-card');
    assert(await rows.evaluateAll(rows=>rows.every(r=>r.getBoundingClientRect().height<=58)),'each game must fit on one compact line');
    assert(await page.locator('.lineup-content').evaluate(e=>e.clientHeight)>=80,'editor needs a usable scroll area');
    assert(await page.locator('.minigame-config-content').evaluate(e=>e.scrollWidth<=e.clientWidth),'editor horizontal overflow');
    if(engine==='webkit' && c.width===390 && process.env.SIGHT_WORDS_SCREENSHOTS) {
      await page.getByRole('tab',{name:/Browse games/}).click();
      await page.screenshot({path:path.join(process.env.SIGHT_WORDS_SCREENSHOTS,'minigame-library-iphone.png')});
      await page.getByRole('tab',{name:/My lineup/}).click();
      await page.screenshot({path:path.join(process.env.SIGHT_WORDS_SCREENSHOTS,'minigame-lineup-iphone.png')});
    }
    await page.locator('#minigame-config-close-btn').scrollIntoViewIfNeeded();
    await safeBounds(page,'#minigame-config-close-btn',c.width,c.height,c);
    await page.locator('#minigame-config-close-btn').click();
  }
  console.log('PASS editor safe areas, narrow portrait, landscape, reachable Done button');
}
async function touchReorderChecks(page) {
  await page.setViewportSize({width:390,height:844});
  await page.addStyleTag({content:':root{--safe-top:47px;--safe-bottom:34px;--safe-left:0px;--safe-right:0px;}'});
  await openEditor(page);
  await page.locator('#lineup-save-menu summary').click();
  await named(page,'All games').click();
  await page.locator('#lineup-save-menu summary').click();
  await page.locator('.lineup-content').evaluate(e=>e.scrollTop=0);
  const original=await order(page);
  const cdp=await page.context().newCDPSession(page);
  async function touch(type,x,y) {
    await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:0,radiusX:5,radiusY:5,force:1}]});
  }
  try {
    const handle=await page.locator('.lineup-drag-handle').first().boundingBox();
    const area=await page.locator('.lineup-content').boundingBox();
    const x=handle.x+handle.width/2, y=handle.y+handle.height/2;
    await touch('touchStart',x,y);
    assert.equal(await page.locator('.lineup-drag-ghost').count(),1);
    for(let i=1;i<=12;i++) {await touch('touchMove',x,y+(area.y+area.height-6-y)*i/12);await page.waitForTimeout(16);}
    // Hold at the edge: the list must keep scrolling without further finger moves.
    const beforeScroll=await page.locator('.lineup-content').evaluate(e=>e.scrollTop);
    await page.waitForTimeout(3300);
    const afterScroll=await page.locator('.lineup-content').evaluate(e=>e.scrollTop);
    assert(afterScroll>beforeScroll+500,'continuous edge auto-scroll');
    assert.deepEqual(await order(page),original,'touch preview must not save early');
    assert.equal(await page.locator('.lineup-drop-slot').evaluate(e=>e.nextElementSibling),null,'gap follows the finger to the end');
    if(process.env.SIGHT_WORDS_SCREENSHOTS) await page.screenshot({path:path.join(process.env.SIGHT_WORDS_SCREENSHOTS,'minigame-touch-drag.png')});
    await touch('touchEnd');await page.waitForTimeout(200);
    const moved=[...original.slice(1),original[0]];
    assert.deepEqual(await order(page),moved,'touch drop saves exact order');
    assert.equal(await page.locator('.lineup-drag-ghost,.lineup-drop-slot').count(),0);
    // Swiping a game name should scroll naturally, rather than start another drag.
    await page.locator('.lineup-content').evaluate(e=>e.scrollTop=0);
    const name=await page.locator('.lineup-game-name').first().boundingBox();
    await touch('touchStart',name.x+name.width/2,name.y+name.height/2);
    for(let i=1;i<=10;i++) {await touch('touchMove',name.x+name.width/2,name.y+name.height/2-i*14);await page.waitForTimeout(20);}
    await touch('touchEnd');await page.waitForTimeout(200);
    assert(await page.locator('.lineup-content').evaluate(e=>e.scrollTop)>50,'ordinary row swipes scroll the list');
    assert.equal(await page.locator('.lineup-drag-ghost').count(),0);
    assert.deepEqual(await order(page),moved);
    // OS cancellation or switching away must restore the old order and clear overlays.
    await page.locator('.lineup-content').evaluate(e=>e.scrollTop=0);
    const first=await page.locator('.lineup-drag-handle').first().boundingBox();
    await touch('touchStart',first.x+22,first.y+22);
    await touch('touchMove',first.x+22,first.y+160);
    await page.waitForTimeout(100);await touch('touchCancel');
    assert.deepEqual(await order(page),moved,'cancelled touch does not save');
    assert.equal(await page.locator('.lineup-drag-ghost,.lineup-drop-slot').count(),0);
    await page.locator('#minigame-config-close-btn').click();
  } finally {await cdp.detach();}
  console.log('PASS native touch drag, live gap, edge auto-scroll, ordinary swipes, cancellation, cleanup');
}
async function interact(page,id) {
  if(['rainbowPainter','robotBuilder','cookieChef','pizzaParty'].includes(id)) {
    for(let i=0;i<(['cookieChef','pizzaParty'].includes(id)?3:1);i++) await page.evaluate(()=> {
      const status=document.querySelector('.fun-status').textContent;
      [...document.querySelectorAll('.fun-tile')].find(b=>status.endsWith(b.textContent)).click();
    });
  } else if(id==='dinoDig') {
    await page.evaluate(()=>document.querySelectorAll('.fun-tile').forEach(b=>{b.click();b.click();}));
  } else if(id==='rocketLaunch') {
    for(let i=0;i<8;i++) await page.locator('.fun-action').click();
  } else if(id==='gardenGrow') {
    await page.locator('.fun-tile').first().click();await page.locator('.fun-tile').first().click();
  } else if(id==='fireflyFinder') await page.locator('.fun-tile.is-lit').click();
  else if(['treasureTrail','musicMaker'].includes(id)) {
    await page.waitForTimeout(1400);await page.locator('.fun-tile').first().click();await page.locator('.fun-tile').first().click();
  } else if(id==='bubbleCount') {
    for(let n=1;n<=6;n++) await page.locator('.fun-tile').filter({hasText:new RegExp(`^${n} `)}).click();
  } else if(id==='beeBouquet') {
    await page.locator('.fun-tile').nth(1).click();await page.locator('.fun-tile').nth(4).click();
  } else if(id==='meteorShield') {
    await page.waitForTimeout(450);
    const r=await page.locator('.fun-falling').first().boundingBox();
    await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);
  }
  else if(id==='duckPond') await page.locator('.fun-tile').filter({hasText:'🦆'}).first().click();
  else if(id==='monsterMatch') {await page.locator('.fun-tile').nth(0).click();await page.locator('.fun-tile').nth(4).click();}
  else if(id==='snowballStack') {await page.waitForTimeout(550);await page.locator('.fun-action').click();}
  else if(['penguinSlide','pirateTreasure'].includes(id)) {await named(page,'⬅️ Left').click();await page.waitForTimeout(1900);}
  else if(id==='frogHop') await page.locator('.fun-tile').filter({hasText:'✨'}).click();
  else if(id==='shapeSorter') {
    const piece=await page.locator('.fun-sort-piece').boundingBox(),bin=await page.locator('[data-bin="0"]').boundingBox();
    await page.mouse.move(piece.x+piece.width/2,piece.y+piece.height/2);await page.mouse.down();
    await page.mouse.move(bin.x+bin.width/2,bin.y+bin.height/2,{steps:6});await page.mouse.up();
  }
  assert(await page.evaluate(()=>testGame.score)>0,`${id}: successful play must earn points`);
}
async function gameChecks(page) {
  // Let the initial quiz question finish before using deterministic random fixtures.
  await page.waitForTimeout(400);
  const games=await page.evaluate(()=>SIGHT_WORDS_EXTRA_GAMES.map(g=>g.id));
  for(const id of games) {
    await page.setViewportSize({width:390,height:844});
    await page.addStyleTag({content:':root{--safe-top:47px;--safe-bottom:34px;--safe-left:0px;--safe-right:0px;}'});
    await start(page,id,id==='meteorShield'?0.6:id==='monsterMatch'?0.999:0.1);
    await safeBounds(page,'.fun-game',390,844,{top:47,bottom:34,side:0});
    await interact(page,id);
    const session=await page.evaluate(()=>({score:testGame.score}));
    await named(page,'Done').click();
    await page.evaluate(()=>testGame.endGame());
    assert.deepEqual(await page.evaluate(()=>completions),[session.score],`${id}: complete exactly once`);
    assert.deepEqual(await page.evaluate(()=>({timers:testGame.session.timers.size,listeners:testGame.session.listeners.length})),{timers:0,listeners:0},`${id}: end cleans up`);
    await page.evaluate(()=>testGame.destroy());
    await page.setViewportSize({width:844,height:390});
    await page.addStyleTag({content:':root{--safe-top:0px;--safe-bottom:21px;--safe-left:47px;--safe-right:47px;}'});
    await start(page,id,0.1,120);
    await safeBounds(page,'.fun-game',844,390,{top:0,bottom:21,side:47});
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(()=>completions.length),1,`${id}: timed completion`);
    await page.evaluate(()=> {testGame.destroy();testGame.duration=20000;});
    assert.equal(await page.locator('.fun-game').count(),0,`${id}: destroy removes surface`);
    console.log(`PASS ${id}: play, scoring, portrait, landscape, timer, cleanup`);
  }
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.fun-game').count(),0,'old timers must not recreate destroyed games');
  // Stop while a delayed sequence is pending, rather than after it finishes.
  await start(page,'musicMaker');
  const cancelled=await page.evaluate(()=> {const session=testGame.session;testGame.destroy();return {timers:session.timers.size,listeners:session.listeners.length};});
  assert.deepEqual(cancelled,{timers:0,listeners:0});
  assert.deepEqual(await page.evaluate(()=>completions),[],'destroy must not complete a cancelled game');
  await page.evaluate(()=>document.querySelector('#minigame-area').classList.remove('active'));
}
async function quizIntegrationChecks(page) {
  await page.evaluate(()=> {
    Math.random=window.testNativeRandom;
    setMiniGameLineup(['rocketLaunch','monsterMatch']);currentMiniGameIdx=0;
    triggerMiniGame();
  });
  assert.equal(await page.locator('.fun-game').getAttribute('data-game-id'),'rocketLaunch');
  await page.locator('.fun-done').click();
  await page.waitForTimeout(4800);
  assert.equal(await page.evaluate(()=>isMiniGameActive),false);
  assert.equal(await page.locator('#choice0').isVisible(),true);
  assert.equal(await page.evaluate(()=>currentMiniGameIdx),1);
  await page.evaluate(()=>triggerMiniGame());
  assert.equal(await page.locator('.fun-game').getAttribute('data-game-id'),'monsterMatch');
  await page.locator('.fun-done').click();
  await page.waitForTimeout(4800);
  assert.equal(await page.evaluate(()=>currentMiniGameIdx),0);
  assert.equal(await page.evaluate(()=>isMiniGameActive),false);
  console.log('PASS quiz rewards return to questions and rotate the chosen lineup');
}
(async()=> {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const engine of ['webkit','chromium']) {
    const browser=await playwright[engine].launch({headless:true});
    try {
      const context=await browser.newContext({viewport:{width:1280,height:1100},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.setDefaultTimeout(8000);
      await page.route('**/*',route=> /vanta|three\.min|lottie/i.test(route.request().url())?route.abort():route.continue());
      await page.addInitScript(()=> {
        window.testNativeRandom=Math.random;
        if(!window.AudioContext&&!window.webkitAudioContext) window.AudioContext=class{state='running';};
        if(!localStorage.getItem('testInitialized')) {
          localStorage.setItem('quizTimeLimit','0');localStorage.setItem('animatedBackgroundsEnabled','false');
          localStorage.setItem('wordSelectionState',JSON.stringify({dolch:{A:true}}));localStorage.setItem('miniGameOrder',JSON.stringify(['catRescue','balloonPop']));
          localStorage.setItem('testInitialized','yes');
        }
        document.addEventListener('DOMContentLoaded',()=> {window.playBell=()=>{};window.playOsc=()=>{};window.speak=()=>{};});
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'load'});
      await lineupChecks(page);await editorLayoutChecks(page,engine);
      if(engine==='chromium') await touchReorderChecks(page);
      if(!process.argv.includes('--lineups-only')) {await gameChecks(page);await quizIntegrationChecks(page);}
      assert.deepEqual(errors,[],`${engine}: browser errors`);
      console.log(`PASS ${engine}: all mini-game and lineup checks`);
    } finally {await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=> {server.close();setTimeout(()=>process.exit(process.exitCode||0),100);});
