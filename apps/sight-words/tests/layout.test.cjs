// Set SIGHT_WORDS_PLAYWRIGHT to a Playwright module path if it is not installed locally.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const playwright = require(process.env.SIGHT_WORDS_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const name = path.basename(url.pathname) || 'index.html';
  const file = path.join(root, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404);res.end();return; }
  let content = fs.readFileSync(file);
  if (name === 'index.html' && url.searchParams.has('short-dvh')) {
    // Reproduce WebKit's standalone under-reporting, while keeping vh full size.
    // Desktop WebKit cannot run the iOS Add to Home Screen host itself.
    content = content.toString().replace('--app-height: 100dvh;', '--app-height: calc(100vh - 59px);');
  }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/json');
  res.end(content);
});
const cases = [
  {name:'small phone',width:320,height:568,top:0,bottom:0,side:0},
  {name:'iPhone portrait',width:390,height:844,top:47,bottom:34,side:0},
  {name:'iPhone large portrait',width:430,height:932,top:59,bottom:34,side:0},
  {name:'iPhone landscape',width:844,height:390,top:0,bottom:21,side:47},
  {name:'small landscape',width:667,height:375,top:0,bottom:0,side:0},
  {name:'Safari with toolbars',width:390,height:664,top:0,bottom:0,side:0},
  {name:'desktop',width:1280,height:800,top:0,bottom:0,side:0},
];
async function safeBounds(page, selector, c) {
  const r = await page.locator(selector).evaluate(e => {
    const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
  });
  assert(r.left >= c.side - 1 && r.right <= c.width - c.side + 1, `${c.name} ${selector} horizontal clipping: ${JSON.stringify(r)}`);
  assert(r.top >= c.top - 1 && r.bottom <= c.height - c.bottom + 1, `${c.name} ${selector} vertical clipping: ${JSON.stringify(r)}`);
}
async function checkQuiz(page, c) {
  await page.setViewportSize({width:c.width,height:c.height});
  await page.addStyleTag({content:`:root{--safe-top:${c.top}px;--safe-bottom:${c.bottom}px;--safe-left:${c.side}px;--safe-right:${c.side}px;}`});
  await page.evaluate(() => {currentGameMode='listenAndPickWord';updateModeUI();nextQ();});
  await page.waitForTimeout(350);
  const edges=await page.evaluate(() => ({
    html:document.documentElement.getBoundingClientRect().bottom,
    body:document.body.getBoundingClientRect().bottom,
    controls:document.querySelector('#controls').getBoundingClientRect().bottom,
  }));
  for(const [name,bottom] of Object.entries(edges)) assert(Math.abs(bottom-c.height)<=1,`${c.name}: ${name} leaves a gap below it: ${bottom} vs ${c.height}`);
  for(const s of ['#score','#timer-wrapper','#controls-RHS-container','#choice0','#choice1','#timer-display','#mode-toggle-btn','#listen-btn']) await safeBounds(page,s,c);
  await page.locator('#timer-display').click();await safeBounds(page,'#timer-select',c);await page.locator('#timer-display').click();
  await page.locator('#mode-toggle-btn').click();await page.waitForTimeout(250);
  for(const s of ['#word-to-read','#soundChoice0','#soundChoice1','#submit-answer-btn']) await safeBounds(page,s,c);
  await page.locator('#word-list-open-btn').click();await safeBounds(page,'.word-list-modal-content',c);
  await page.locator('#word-list-done-btn').click();
  await page.locator('#edit-minigames-btn').click();await safeBounds(page,'.minigame-config-content',c);
  await page.locator('#minigame-config-close-btn').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`${c.name}: page overflow`);
}
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const engine of ['webkit','chromium']) {
    const browser=await playwright[engine].launch({headless:true});
    try {
      for(const standalone of [false,true]) {
        const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
        const page=await context.newPage(),errors=[];
        page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
        await page.route('**/*',route=>/vanta|three\.min|lottie/i.test(route.request().url())?route.abort():route.continue());
        await page.addInitScript(standalone => {
          Object.defineProperty(navigator,'standalone',{get:()=>standalone});
          if(!window.AudioContext&&!window.webkitAudioContext) window.AudioContext=class{state='running';};
          localStorage.setItem('quizTimeLimit','0');localStorage.setItem('animatedBackgroundsEnabled','false');
          localStorage.setItem('miniGamesEnabled','false');localStorage.setItem('wordSelectionState',JSON.stringify({dolch:{A:true}}));
          document.addEventListener('DOMContentLoaded',()=>{window.playBell=()=>{};window.playOsc=()=>{};window.speak=()=>{};});
        },standalone);
        const base=`http://127.0.0.1:${server.address().port}/index.html`;
        await page.goto(base+(standalone?'?short-dvh=1':''),{waitUntil:'load'});
        await page.waitForFunction(()=>document.querySelector('#choice0').textContent.length>0);
        if(standalone) {
          // Control: the old dvh layout really leaves the reported 59px gap.
          await page.evaluate(()=>document.documentElement.classList.remove('home-screen-app'));
          assert.equal(Math.round(await page.locator('#controls').evaluate(e=>e.getBoundingClientRect().bottom)),873);
          await page.evaluate(()=>document.documentElement.classList.add('home-screen-app'));
        }
        for(const c of cases) {
          await checkQuiz(page,c);
          console.log(`PASS ${engine} ${standalone?'home-screen (short dvh)':'browser'}: ${c.name}, footer flush and controls safe`);
          if(standalone&&engine==='webkit'&&c.name==='iPhone large portrait'&&process.env.SIGHT_WORDS_SCREENSHOTS) {
            await page.screenshot({path:path.join(process.env.SIGHT_WORDS_SCREENSHOTS,'sight-words-home-screen-bottom.png')});
          }
        }
        // The same full-height variable must carry through a game and back to the quiz.
        if(standalone) {
          await page.setViewportSize({width:430,height:932});
          await page.addStyleTag({content:':root{--safe-top:59px;--safe-bottom:34px;--safe-left:0px;--safe-right:0px;}'});
          await page.evaluate(()=>{setMiniGameLineup(['rocketLaunch']);currentMiniGameIdx=0;triggerMiniGame();});
          await safeBounds(page,'#minigame-area',{width:430,height:932,top:59,bottom:34,side:0});
          await page.locator('.fun-done').click();
          await page.waitForTimeout(4800);
          assert.equal(Math.round(await page.locator('#controls').evaluate(e=>e.getBoundingClientRect().bottom)),932);
        }
        assert.deepEqual(errors,[],`${engine}: runtime errors`);await context.close();
      }
    } finally {await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server.close();setTimeout(()=>process.exit(process.exitCode||0),100);});
