// Build first: npm run build:bundle
// Run: node --test tests/app-canvas.test.cjs (Node 22+, Chromium).
// Set CHROMIUM_PATH and TMPDIR when the environment requires custom paths.
// Exercises maintained TrackListView/PlayerCore through the production entry point, with local media and no account.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const chromium = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.next = 0; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); });
    this.ws.addEventListener('close', () => { for (const entry of this.pending.values()) entry.reject(Error('CDP connection closed')); this.pending.clear(); });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data), entry = this.pending.get(message.id);
      if (entry) { this.pending.delete(message.id); message.error ? entry.reject(Error(JSON.stringify(message.error))) : entry.resolve(message.result); }
    });
  }
  async call(method, params = {}) {
    await this.ready; const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000);
      this.pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async js(expression) {
    const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}

async function browser(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'musiccloud-canvas-'));
  const requests = [];
  const wav = Buffer.alloc(44 + 8000 * 120, 128);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/cover.svg')) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="red"/></svg>'); return;
    }
    if (req.url.startsWith('/media.wav')) {
      const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      const start = match ? Number(match[1]) : 0, end = match && match[2] ? Number(match[2]) : wav.length - 1;
      res.writeHead(match ? 206 : 200, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(match ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) });
      res.end(wav.subarray(start, end + 1)); return;
    }
    if (req.url.endsWith('/loudnessmap')) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.from(Array.from({ length: 1024 }, (_, i) => 20 + i % 210))); return;
    }
    if (req.url.startsWith('/api/')) {
      requests.push(req.method);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return;
    }
    const file = path.join(root, 'dist', req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const proc = spawn(chromium, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', `--user-data-dir=${directory}/profile`, 'about:blank']);
  let log = '', api;
  t.after(async () => {
    if (api) { try { await api.call('Browser.close'); } catch {} api.ws.close(); }
    if (proc.exitCode === null) { await Promise.race([new Promise(resolve => proc.once('exit', resolve)), delay(2000)]); if (proc.exitCode === null) proc.kill('SIGTERM'); }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Chromium startup timeout: ' + log)), 15000);
    proc.stderr.on('data', bytes => { log += bytes; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    proc.on('exit', code => { clearTimeout(timeout); reject(Error('Chromium exited ' + code)); });
  });
  const port = new URL(debuggerUrl).port;
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  api = new CDP(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await api.call('Page.enable'); await api.call('Runtime.enable'); await api.call('Network.enable');
  await api.call('Network.setBypassServiceWorker', { bypass: true });
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await api.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  for (let i = 0; i < 100; i++) { if (await api.js('Boolean(window.mcloud?.listIndex.section)')) break; if (i === 99) throw Error('App initialization timeout'); await delay(100); }
  await api.js(`(async () => {
    mcloud.user.closeUI(); mcloud.playerCore.pause(); mcloud.ui.theme.set('light-rounded');
    mcloud.listIndex.setIndex({ lists: [{ id: 700001, owner: mcloud.user.info.id, visibility: 0, version: 0, name: 'Canvas tracks' }] });
    window.list = mcloud.listIndex.getList(700001);
    list.loadFromGetResult({ id: 700001, owner: mcloud.user.info.id, visibility: 0, version: 0, name: 'Canvas tracks', tracks: Array.from({ length: 500 }, (_, i) => ({ id: 800000 + i, owner: 0, visibility: 0, type: 'audio', name: 'Track ' + i + ' 中文 🎵', artist: 'Artist ' + i, length: 120, url: '/media.wav?id=' + i, thumburl: '/cover.svg?id=' + i, lyrics: '[00:00.00]First lyric line\\n[00:20.00]Second lyric line' })) });
    list.fetching = Promise.resolve();
    // Client-only fixture: reordering updates the real model without an account write.
    window.reorders = 0; list.put = () => { reorders++; };
    mcloud.listIndex.showTracklist(700001); mcloud.ui.sidebar.toggleHide(true);
    await new Promise(r => setTimeout(r, 1400));
    window.view = list.contentView; window.playerBar = mcloud.ui.bottomBar;
    // Wait for the real idle-batched DOM insertion, not a machine-speed delay.
    await view.listView.slowLoading;
    await document.fonts.ready;
    await new Promise(r=>setTimeout(r,150));
    window.scenePixel = (renderer, x, y) => {
      const gl = renderer.canvas.getContext('webgl'), r = renderer.canvas.getBoundingClientRect(), p = new Uint8Array(4), dpr = gl.drawingBufferWidth / r.width;
      gl.readPixels(Math.floor((x - r.left) * dpr), gl.drawingBufferHeight - 1 - Math.floor((y - r.top) * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [...p];
    };
    window.sceneInk = (renderer, element) => {
      const gl = renderer.canvas.getContext('webgl'), r = element.getBoundingClientRect(), origin = renderer.canvas.getBoundingClientRect(), dpr = gl.drawingBufferWidth / origin.width;
      const x = Math.max(0, Math.ceil((r.left - origin.left) * dpr)), y = Math.max(0, Math.ceil((r.top - origin.top) * dpr));
      const w = Math.min(gl.drawingBufferWidth - x, Math.floor(r.width * dpr)), h = Math.min(gl.drawingBufferHeight - y, Math.floor(r.height * dpr)), p = new Uint8Array(w * h * 4);
      gl.readPixels(x, gl.drawingBufferHeight - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, p);
      let ink = 0, sum = 0; for (let i = 0; i < p.length; i += 4) { if (p[i+3]) ink++; sum += p[i] + p[i+1] + p[i+2] + p[i+3]; } return { ink, sum };
    };
  })()`);
  return { api, requests };
}

const supported = fs.existsSync(chromium);
const wait = async (api, expression) => {
  for (let i = 0; i < 100; i++) { if (await api.js(expression)) return; await delay(50); }
  throw Error('Condition not reached: ' + expression);
};
const point = (api, expression) => api.js(`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
async function click(api, p, modifiers = 0, button = 'left') {
  await api.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
  await api.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button, buttons: button === 'left' ? 1 : 2, clickCount: 1, modifiers });
  await api.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button, buttons: 0, clickCount: 1, modifiers });
}
async function key(api, key, modifiers = 0) {
  await api.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, modifiers });
  await api.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, modifiers });
}

test('real main track viewport keeps native selection, keyboard, drag, cover pixels and bounded nearby resources', { skip: !supported, timeout: 60000 }, async t => {
  const { api, requests } = await browser(t);
  const initial = await api.js(`({ active: view.scrollBox.dom.hasAttribute('data-canvas-rendered'), rows: document.querySelectorAll('.tracklistview > li').length, stats: {...view.renderer.stats}, maxHeight: Math.max(...[...view.renderer.resources.values()].map(r=>r.canvas.height)), viewport: view.scrollBox.dom.clientHeight, nameInk: sceneInk(view.renderer,view.listView.get(0).dom.querySelector('.name')) })`);
  t.diagnostic('Initial 500-row viewport: '+JSON.stringify(initial));
  assert.equal(initial.active, true); assert.equal(initial.rows, 500); assert.ok(initial.nameInk.ink > 60, 'Actual row text is present on Canvas');
  assert.ok(initial.stats.cachedResources < 25 && initial.stats.cachedImages < 25, JSON.stringify(initial));
  assert.ok(initial.maxHeight < initial.viewport, 'No full-list texture is allocated');
  const cover = await api.js(`(()=>{const r=view.listView.get(0).dom.querySelector('.pic').getBoundingClientRect();return {center:scenePixel(view.renderer,r.left+r.width*.2,r.top+r.height*.5),top:scenePixel(view.renderer,r.left+r.width*.2,r.top+r.height*.1)}})()`);
  assert.ok(cover.center[0] > cover.center[1] + 100); assert.ok(Math.abs(cover.top[0] - cover.top[1]) < 5, 'Non-square cover remains contained, with unpainted letterbox space');
  const row = await point(api, 'view.listView.get(0).dom');
  await click(api, row, 2); await delay(200);
  assert.equal(await api.js('view.listView.get(0).selected'), true, 'Ctrl-click reaches real selection helper');
  const selectedInk = await api.js('sceneInk(view.renderer,view.listView.get(0).dom).sum');
  await api.js('view.listView.get(0).dom.focus()'); await key(api, 'ArrowDown');
  assert.equal(await api.js('document.activeElement===view.listView.get(1).dom'), true);
  await key(api, 'PageDown');
  assert.equal(await api.js('document.activeElement===view.listView.get(1).dom'), false);
  await api.js('view.scrollBox.dom.scrollTop=0'); await delay(250);
  await click(api, await point(api, 'view.listView.get(1).dom'), 0, 'right'); await delay(200);
  assert.ok(await api.js('Boolean(document.querySelector(".context-menu"))'), 'Native context menu is outside the suppressed viewport');
  await key(api, 'Escape'); await api.js('document.querySelectorAll(".context-menu").forEach(e=>e.remove())');
  // Native events use the production drag manager/reorder handler and marker DOM.
  await api.js(`(()=>{view.listView.selectionHelper.enabled=false;const from=view.listView.get(1).dom,to=view.listView.get(4).dom,r=to.getBoundingClientRect();window.dragData=new DataTransfer();from.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dragData}));to.dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer:dragData,clientX:r.left+80,clientY:r.bottom-5}));})()`); await delay(200);
  const marker = await api.js(`(()=>{const e=document.querySelector('.tracklistview .dragover-placeholder'),r=e?.getBoundingClientRect();return {exists:!!e,ink:e?sceneInk(view.renderer,{getBoundingClientRect:()=>({left:r.left,top:r.top-2,width:r.width,height:4})}).ink:0}})()`);
  assert.ok(marker.exists && marker.ink > 100, 'The actual CSS drag marker has painted pixels');
  await api.js(`(()=>{const from=view.listView.get(1).dom,to=view.listView.get(4).dom,r=to.getBoundingClientRect();to.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dragData,clientX:r.left+80,clientY:r.bottom-5}));from.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dragData}));})()`); await delay(250);
  assert.equal(await api.js('list.tracks[4].id'), 800001); assert.equal(await api.js('reorders'), 1);
  await api.js(`list.updateTrackInfo(list.tracks[0],{...list.tracks[0].infoObj,name:'Updated name 日本語',thumburl:'/cover.svg?changed'});`); await delay(250);
  assert.equal(await api.js('view.listView.get(0).dom.querySelector(".name").textContent'), 'Updated name 日本語');
  assert.notEqual(await api.js('sceneInk(view.renderer,view.listView.get(0).dom).sum'), selectedInk);
  const cacheMeasurements = [];
  for (const index of [80, 160, 260, 400, 490]) {
    await api.js(`view.scrollBox.dom.scrollTop=view.listView.get(${index}).dom.offsetTop`);
    await wait(api, `view.renderer.resources.has(view.listView.get(${index}).dom) && view.renderer.stats.cachedResources > 0`);
    const bounded = await api.js(`({...view.renderer.stats,maxHeight:Math.max(...[...view.renderer.resources.values()].map(r=>r.canvas.height)),maxWidth:Math.max(...[...view.renderer.resources.values()].map(r=>r.canvas.width)),foregroundBytes:[...view.renderer.resources.values()].reduce((sum,r)=>sum+r.canvas.width*r.canvas.height*4,0)})`);
    cacheMeasurements.push({index,...bounded});
    assert.ok(bounded.cachedResources > 0 && bounded.cachedResources < 30 && bounded.cachedImages > 0 && bounded.cachedImages < 30 && bounded.maxHeight > 0 && bounded.maxHeight < 150, JSON.stringify(bounded));
  }
  t.diagnostic('Nearby cache after scrolling: '+JSON.stringify(cacheMeasurements));
  await api.js('view.listView.get(490).dom.focus()'); await key(api, 'Home'); await delay(300);
  assert.equal(await api.js('document.activeElement===view.listView.get(0).dom && view.scrollBox.dom.scrollTop<100'), true);
  await api.call('Input.dispatchMouseEvent', {type:'mouseMoved',x:1190,y:60}); await delay(200);
  const bottomBeforeHover = await api.js('playerBar.renderer.stats.rasterizations');
  await api.call('Input.dispatchMouseEvent', {type:'mouseMoved',...await point(api,'view.listView.get(0).dom')}); await delay(150);
  assert.equal(await api.js('playerBar.renderer.stats.rasterizations'),bottomBeforeHover,'List hover does not repaint the bottom player');
  assert.ok(requests.every(method => method === 'GET'), 'Fixture makes no account writes');
});

test('real bottom player paints media, seek/volume/lyrics/loudness and isolates resource invalidation', { skip: !supported, timeout: 60000 }, async t => {
  const { api, requests } = await browser(t);
  const beforePlaying = await api.js(`(()=>{const r=view.listView.get(0).dom.querySelector('.picbox').getBoundingClientRect();return scenePixel(view.renderer,r.left+r.width*.5,r.top+r.height*.5)})()`);
  await click(api, await point(api, 'view.listView.get(0).dom'));
  await wait(api, 'mcloud.playerCore.isPlaying && mcloud.playerCore.audio.readyState>=2 && !playerBar.progressBar.loudnessMap.hidden');
  await delay(400);
  assert.equal(await api.js('view.curPlaying.current===view.listView.get(0) && !!view.listView.get(0).dom.querySelector(".pos svg")'), true, 'Real selected track updates the Canvas-painted playing icon');
  const playingPixel = await api.js(`(()=>{const r=view.listView.get(0).dom.querySelector('.picbox').getBoundingClientRect();return scenePixel(view.renderer,r.left+r.width*.5,r.top+r.height*.5)})()`);
  assert.notDeepEqual(playingPixel,beforePlaying,'The real playing glyph changes the composed row pixels');
  await click(api, await point(api, 'playerBar.btnPlay.dom')); await delay(400);
  assert.equal(await api.js('mcloud.playerCore.isPlaying'), false, 'Actual player pause button hit');
  const player = await api.js(`(()=>{const r=playerBar.trackImg.dom.getBoundingClientRect();return {active:playerBar.renderer.source.hasAttribute('data-canvas-rendered'),cover:scenePixel(playerBar.renderer,r.left+10,r.top+35),letterbox:scenePixel(playerBar.renderer,r.left+10,r.top+7),name:document.querySelector('.bottombar .track-info').textContent,infoInk:sceneInk(playerBar.renderer,document.querySelector('.bottombar .track-info')).ink,lyricInk:sceneInk(playerBar.renderer,playerBar.lyrics.dom).ink,loudnessInk:sceneInk(playerBar.renderer,playerBar.progressBar.loudnessMap.dom).sum}})()`);
  assert.equal(player.active, true); assert.ok(player.cover[0] > player.cover[1] + 150); assert.ok(Math.abs(player.letterbox[0] - player.letterbox[1]) < 5);
  assert.match(player.name, /Track 0.* - Artist 0/); assert.ok(player.infoInk > 60 && player.lyricInk > 30 && player.loudnessInk > 500);
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:1100,y:300}); await delay(400);
  const paused = await api.js('({list:{...view.renderer.stats},player:{...playerBar.renderer.stats}})'); await delay(400);
  assert.deepEqual(await api.js('({list:{...view.renderer.stats},player:{...playerBar.renderer.stats}})'), paused, 'Paused renderer is idle');
  const circle = await api.js(`window.readPlayerCircle=()=>{
    const resource=playerBar.renderer.resources.get(playerBar.btnPlay.dom),r=playerBar.btnPlay.dom.getBoundingClientRect(),native=document.createElement('canvas');
    native.width=resource.canvas.width;native.height=resource.canvas.height;const ctx=native.getContext('2d');ctx.scale(resource.dpr,resource.dpr);ctx.beginPath();ctx.arc(r.width/2,r.height/2,r.width/2,0,Math.PI*2);ctx.fill();
    const expected=ctx.getImageData(0,0,native.width,native.height).data,actual=resource.canvas.getContext('2d').getImageData(0,0,native.width,native.height).data;
    let difference=0;for(let i=3;i<expected.length;i+=4)difference+=Math.abs(expected[i]-actual[i]);
    return {dpr:resource.dpr,meanAlphaError:difference/(native.width*native.height),corner:scenePixel(playerBar.renderer,r.left+5,r.top+5),inside:scenePixel(playerBar.renderer,r.left+10,r.top+10)};
  };readPlayerCircle()`);
  // arc() and roundRect() use different native edge antialiasing paths.
  // The old quadratic approximation scores >11 here; a true circle stays <4.
  assert.ok(circle.meanAlphaError<4 && circle.corner[3]<20 && circle.inside[3]>240,'Play button uses a true native circle mask: '+JSON.stringify(circle));
  t.diagnostic('Player circle/fill checks: '+JSON.stringify(circle));
  const beforeProgress = await api.js('({list:{...view.renderer.stats},player:{...playerBar.renderer.stats},sum:sceneInk(playerBar.renderer,playerBar.progressBar.dom).sum})');
  await api.js('mcloud.playerCore.currentTime=5'); await delay(250);
  const afterProgress = await api.js('({list:{...view.renderer.stats},player:{...playerBar.renderer.stats},sum:sceneInk(playerBar.renderer,playerBar.progressBar.dom).sum})');
  t.diagnostic('Progress raster delta: '+JSON.stringify({list:afterProgress.list.rasterizations-beforeProgress.list.rasterizations,player:afterProgress.player.rasterizations-beforeProgress.player.rasterizations}));
  assert.equal(afterProgress.list.rasterizations, beforeProgress.list.rasterizations, 'Player progress does not repaint list');
  assert.ok(afterProgress.player.rasterizations > beforeProgress.player.rasterizations && afterProgress.player.rasterizations - beforeProgress.player.rasterizations < 8);
  assert.notEqual(afterProgress.sum, beforeProgress.sum); assert.match(await api.js('playerBar.progressBar.refCurrentTime.value.textContent'), /0:05/);
  await api.js('mcloud.playerCore.currentTime=45'); await delay(500);
  assert.match(await api.js('playerBar.lyrics.dom.textContent'), /Second lyric line/);
  const seek = await api.js('(()=>{const r=playerBar.progressBar.refBackground.value.getBoundingClientRect();return {x:r.left+r.width*.75,y:r.top+r.height/2}})()');
  await click(api, seek); await delay(150); assert.ok(Math.abs(await api.js('mcloud.playerCore.currentTime') - 90) < 1);
  await api.call('Emulation.setDeviceMetricsOverride',{width:1200,height:850,deviceScaleFactor:1.25,mobile:false}); await delay(250);
  const fractionalCircle=await api.js('readPlayerCircle()');
  assert.equal(fractionalCircle.dpr,1.25);
  assert.ok(fractionalCircle.meanAlphaError<4 && fractionalCircle.corner[3]<20 && fractionalCircle.inside[3]>240,'Circular player geometry at DPR1.25: '+JSON.stringify(fractionalCircle));
  t.diagnostic('Player circle at DPR1.25: '+JSON.stringify(fractionalCircle));
  const fillColors = await api.js(`(()=>{const r=playerBar.progressBar.refBackground.value.getBoundingClientRect();return {filled:scenePixel(playerBar.renderer,r.left+r.width*.35,r.top+r.height*.5),unfilled:scenePixel(playerBar.renderer,r.left+r.width*.9,r.top+r.height*.5)}})()`);
  t.diagnostic('Seeked progress pixels: '+JSON.stringify(fillColors));
  assert.ok(fillColors.filled[0]>fillColors.filled[1]+100 && fillColors.filled[0]>fillColors.filled[2]+100,'Seeked progress remains visibly primary-red: '+JSON.stringify(fillColors));
  assert.ok(fillColors.unfilled[3]<fillColors.filled[3] || fillColors.unfilled[1]>fillColors.filled[1]+30,'Unfilled progress remains distinct from the filled portion');
  await api.call('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false}); await delay(200);
  await api.js('mcloud.playerCore.volume=.6'); await delay(150);
  const vol = await point(api, 'playerBar.btnVolume.dom'); await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',...vol}); await delay(150);
  assert.equal(await api.js('playerBar.btnVolume.tipView.dom.parentElement===playerBar.dom && !playerBar.renderer.source.contains(playerBar.btnVolume.tipView.dom)'), true, 'Native volume tooltip is outside source suppression');
  assert.equal(await api.js('playerBar.btnVolume.tipView.dom.textContent'), '60%');
  await api.call('Input.dispatchMouseEvent',{type:'mouseWheel',...vol,deltaX:0,deltaY:-100}); await delay(150);
  assert.equal(await api.js('mcloud.playerCore.volume'), .65);
  await api.js('playerBar.btnVolume.dom.focus()'); await key(api,'ArrowRight'); assert.equal(await api.js('mcloud.playerCore.volume'), .66);
  // Updating ordinary canvas pixels has one owner notification and no polling.
  await api.js(`(()=>{const c=playerBar.progressBar.loudnessMap.dom,ctx=c.getContext('2d');ctx.fillStyle='#00ff00';ctx.fillRect(0,0,c.width,c.height);c.dispatchEvent(new Event('canvas-content-changed',{bubbles:true}));})()`); await delay(150);
  const loudPixel = await api.js(`(()=>{const r=playerBar.progressBar.loudnessMap.dom.getBoundingClientRect();return scenePixel(playerBar.renderer,r.left+r.width*.9,r.top+4)})()`);
  assert.ok(loudPixel[1] > loudPixel[0] + 10, 'Live canvas pixels reach real WebGL composition');
  await api.js('mcloud.playerCore.setTrack(null)'); await delay(300);
  assert.equal(await api.js('playerBar.progressBar.loudnessMap.hidden'), true);
  assert.equal(await api.js(`(()=>{const c=playerBar.progressBar.loudnessMap.dom;return c.getContext('2d').getImageData(0,0,1,1).data[3]})()`), 0, 'Track clearing clears ordinary canvas pixels');
  assert.ok(requests.every(method => method === 'GET'));
});

test('main rendering survives native header editing, route reuse, fractional DPR, theme and fallback', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await click(api, await point(api, 'view.header.dom.querySelector(".title")')); await delay(100);
  assert.equal(await api.js('Boolean(view.header.dom.querySelector("input")) && !view.renderer.source.contains(document.activeElement)'), true, 'Native rename input remains outside the paint root');
  await key(api, 'Escape');
  for (let i = 0; i < 3; i++) {
    await api.js('window.previous=view.renderer;mcloud.router.nav("home")'); await wait(api,'!previous.canvas.isConnected');
    assert.equal(await api.js('!previous.canvas.isConnected && !view.scrollBox.dom.hasAttribute("data-canvas-rendered") && !view.dom.querySelector(".dom-canvas-scrollbars")'), true);
    await api.js('mcloud.listIndex.showTracklist(700001)'); await delay(500); await api.js('view.listView.slowLoading');
    assert.equal(await api.js('view.renderer!==previous && view.scrollBox.dom.hasAttribute("data-canvas-rendered") && document.querySelectorAll(".list-content-canvas").length===1'), true);
  }
  // The real content view's scale animation is shared by source and output.
  // Normalize layout coordinates once; do not scale each raster a second time.
  await api.js("view.dom.style.animation='none';view.dom.style.transform='scale(.8)'"); await delay(200);
  const scaled = await api.js(`(()=>{const a=view.renderer.canvas.getBoundingClientRect(),b=view.scrollBox.dom.getBoundingClientRect(),r=view.listView.get(0).dom.querySelector('.pic').getBoundingClientRect();return {offset:a.y-b.y,cover:scenePixel(view.renderer,r.left+r.width*.8,r.top+r.height*.5)}})()`);
  assert.ok(Math.abs(scaled.offset)<1 && scaled.cover[0]>scaled.cover[1]+100,JSON.stringify(scaled));
  const scaledTrack = await api.js(`(()=>{const r=view.dom.querySelector('[data-canvas-scrollbar-axis="vertical"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*.5}})()`);
  await click(api,scaledTrack); await delay(200);
  assert.ok(await api.js('Math.abs(view.scrollBox.dom.scrollTop/(view.scrollBox.dom.scrollHeight-view.scrollBox.dom.clientHeight)-.5)<.03'),'Scaled native scrollbar hit geometry uses host-local coordinates');
  const drag = await api.js(`(()=>{const track=view.dom.querySelector('[data-canvas-scrollbar-axis="vertical"]').getBoundingClientRect(),thumb=view.dom.querySelector('[data-canvas-scrollbar-thumb]').getBoundingClientRect(),e=view.scrollBox.dom;return {x:thumb.left+thumb.width/2,y:thumb.top+thumb.height/2,expected:e.scrollTop+20/(track.height-thumb.height)*(e.scrollHeight-e.clientHeight)}})()`);
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:drag.x,y:drag.y});
  await api.call('Input.dispatchMouseEvent',{type:'mousePressed',x:drag.x,y:drag.y,button:'left',buttons:1,clickCount:1});
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:drag.x,y:drag.y+20,buttons:1});
  await api.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:drag.x,y:drag.y+20,button:'left',buttons:0,clickCount:1}); await delay(200);
  const draggedOffset=await api.js('view.scrollBox.dom.scrollTop');
  assert.ok(Math.abs(draggedOffset-drag.expected)<10,'Scaled thumb drag client-to-logical coordinates: '+JSON.stringify({actual:draggedOffset,expected:drag.expected}));
  t.diagnostic('Shared scale .8: '+JSON.stringify(scaled));
  await api.js("view.dom.style.transform='';view.dom.style.animation='';view.scrollBox.dom.scrollTop=0"); await delay(200);
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1000, height: 760, deviceScaleFactor: 1.25, mobile: false });
  await api.js('mcloud.ui.theme.set("dark-rounded")'); await delay(600);
  const fractional = await api.js(`({active:view.scrollBox.dom.hasAttribute('data-canvas-rendered'),dpr:[...view.renderer.resources.values()][0].dpr,ink:sceneInk(view.renderer,view.listView.get(0).dom.querySelector('.name')).ink,player:playerBar.renderer.source.hasAttribute('data-canvas-rendered')})`);
  assert.equal(fractional.dpr,1.25); assert.ok(fractional.active && fractional.player && fractional.ink>40);
  await api.js(`view.renderer.canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext();playerBar.renderer.canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext()`); await delay(150);
  assert.equal(await api.js('getComputedStyle(view.scrollBox.dom).opacity==="1" && getComputedStyle(playerBar.renderer.source).opacity==="1" && !document.querySelector(".player-canvas")'), true);
  await api.js('mcloud.webfx.unmountView(document.body,playerBar)');
  assert.equal(await api.js('!playerBar.renderer && !playerBar.dom.querySelector(".player-canvas") && !playerBar.dom.querySelector("[data-canvas-rendered]")'),true);
  await api.js('mcloud.webfx.mountView(document.body,playerBar)'); await delay(250);
  assert.equal(await api.js('playerBar.renderer.source.hasAttribute("data-canvas-rendered") && document.querySelectorAll(".player-canvas").length===1'),true);
  await api.js('mcloud.router.nav("home")'); await wait(api,'!view.parentView');
  await api.js(`window.originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:originalContext.call(this,type,...args)};mcloud.listIndex.showTracklist(700001)`); await delay(500);
  assert.equal(await api.js('!view.renderer && !view.scrollBox.dom.hasAttribute("data-canvas-rendered") && view.scrollBox.dom.style.scrollbarWidth!=="none"'), true, 'Missing WebGL leaves usable ordinary DOM and native scrollbars');
  await api.js('HTMLCanvasElement.prototype.getContext=originalContext');
});

test('real list empty/loading/error content paints, retries natively and stops animating after loading', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.js('list.loadFromGetResult({...list.info,tracks:[]});void 0'); await delay(400);
  const empty = await api.js('({ink:sceneInk(view.renderer,view.emptyIndicator.dom).ink,text:view.emptyIndicator.dom.textContent,images:view.renderer.stats.cachedImages,resources:view.renderer.stats.cachedResources})');
  assert.match(empty.text,/Empty/); assert.ok(empty.ink>40 && empty.images===0 && empty.resources<5,JSON.stringify(empty));
  await api.js('window.loading=new mcloud.webfx.LoadingIndicator();view.useLoadingIndicator(loading)'); await delay(1400);
  await api.js(`window.readScene=renderer=>{const gl=renderer.canvas.getContext('webgl'),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p};window.loadingBefore=readScene(view.renderer);window.loadingFrames=view.renderer.stats.frames`);
  await delay(90);
  const animated = await api.js(`(()=>{const after=readScene(view.renderer);let changed=0;for(let i=0;i<after.length;i++)if(after[i]!==loadingBefore[i])changed++;return {changed,frames:view.renderer.stats.frames-loadingFrames}})()`);
  assert.ok(animated.changed>20 && animated.frames>0,JSON.stringify(animated));
  await api.js(`window.retries=0;loading.error('Fixture failure',()=>{retries++;loading.reset()})`); await delay(400);
  const error = await api.js(`(()=>{const p=readScene(view.renderer);let red=0;for(let i=0;i<p.length;i+=4)if(p[i]>p[i+1]+80&&p[i+3]>20)red++;return {red,text:loading.dom.textContent}})()`);
  assert.ok(error.red>40); assert.match(error.text,/Fixture failure/);
  const stopped = await api.js('({...view.renderer.stats})'); await delay(250); assert.deepEqual(await api.js('({...view.renderer.stats})'),stopped,'Error state stops the loading animation frame loop');
  await click(api, await point(api,'loading.dom')); await delay(150); assert.equal(await api.js('retries'),1);
  await api.js('view.useLoadingIndicator(null)'); await delay(400);
  assert.equal(await api.js('view.loadingIndicator===view.emptyIndicator'),true);
});

test('positioned paint scopes keep in-flow children above their parent background without trapping real z contexts', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.js(`(()=>{
    const host=document.createElement('section'),source=document.createElement('article');host.style.cssText='position:fixed;left:400px;top:50px;width:300px;height:260px;z-index:1000';source.style.cssText='position:absolute;inset:0';
    source.innerHTML='<section style="position:relative;width:280px;height:220px;background:blue"><div style="position:absolute;z-index:-1;inset:0;background:red"></div><div style="width:240px;height:160px;background:#00cc00"><div style="position:absolute;left:20px;top:60px;width:80px;height:40px;background:yellow"></div></div><div style="position:absolute;z-index:2;left:170px;top:80px;width:40px;height:40px;background:magenta"></div></section><div style="position:absolute;z-index:0;left:140px;top:50px;width:100px;height:100px;background:cyan"></div>';
    host.appendChild(source);document.body.appendChild(host);window.scopeRenderer=new view.renderer.constructor(source,host);
  })()`); await delay(250);
  const colors = await api.js(`(()=>{const r=scopeRenderer.source.getBoundingClientRect();return [[30,30],[265,30],[30,80],[150,70],[180,90]].map(([x,y])=>scenePixel(scopeRenderer,r.left+x,r.top+y))})()`);
  assert.deepEqual(colors,[[0,204,0,255],[0,0,255,255],[255,255,0,255],[0,255,255,255],[255,0,255,255]],'In-flow fill, covered negative context, positioned descendant, zero sibling, and positive escaped context retain CSS order');
  await api.js('scopeRenderer.dispose();scopeRenderer.shell.remove()');
});

test('fractional player output keeps cached text texels, backing scale and aligned presentation without changing native hit space', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.call('Emulation.setDeviceMetricsOverride',{width:1200,height:850,deviceScaleFactor:1.25,mobile:false});
  await api.js('mcloud.playerCore.setTrack(list.tracks[0])'); await delay(200);
  await api.js(`mcloud.playerCore.currentTime=5;const compositor=playerBar.renderer.compositor,render=compositor.render;compositor.render=function(sources,layers,opacity){window.playerSources=sources;return render.call(this,sources,layers,opacity)};playerBar.renderer.invalidate()`);
  await delay(500);
  const result=await api.js(`(()=>{
    const renderer=playerBar.renderer,element=playerBar.dom.querySelector('.track-info'),resource=renderer.resources.get(element),placement=playerSources[renderer.tree.byElement.get(element).id][0],dpr=devicePixelRatio;
    const original=resource.canvas.getContext('2d').getImageData(0,0,resource.canvas.width,resource.canvas.height).data;
    const gl=renderer.compositor.gl,pixels=new Uint8Array(renderer.canvas.width*renderer.canvas.height*4);gl.readPixels(0,0,renderer.canvas.width,renderer.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const x0=Math.round(placement.rect.x*dpr),y0=Math.round(placement.rect.y*dpr);let maxAlphaError=0,ink=0;
    for(let y=0;y<resource.canvas.height;y++)for(let x=0;x<resource.canvas.width;x++){
      const alpha=original[(y*resource.canvas.width+x)*4+3];if(alpha)ink++;
      maxAlphaError=Math.max(maxAlphaError,Math.abs(alpha-pixels[((renderer.canvas.height-1-y0-y)*renderer.canvas.width+x0+x)*4+3]));
    }
    const rect=renderer.canvas.getBoundingClientRect(),source=renderer.source.getBoundingClientRect(),controls=renderer.shell.querySelector('.dom-canvas-scrollbars').getBoundingClientRect();
    return {hitOrigin:[controls.x*dpr,controls.y*dpr],hitHeight:controls.height,dpr,maxAlphaError,ink,backing:[renderer.canvas.width,renderer.canvas.height],css:[parseFloat(renderer.canvas.style.width),parseFloat(renderer.canvas.style.height)],physicalOrigin:[rect.x*dpr,rect.y*dpr],nativeOrigin:[source.x*dpr,source.y*dpr],sourceHeight:renderer.source.clientHeight,sourceOpacity:renderer.source.hasAttribute('data-canvas-rendered')};
  })()`);
  t.diagnostic('Fractional player presentation: '+JSON.stringify(result));
  assert.equal(result.sourceHeight,70); assert.equal(result.sourceOpacity,true); assert.ok(result.ink>100);
  assert.equal(result.maxAlphaError,0,'Actual cached player text alpha reaches WebGL without whole-output interpolation');
  assert.deepEqual(result.backing,[Math.ceil(1176*1.25),88]);
  for(let i=0;i<2;i++){
    assert.ok(Math.abs(result.css[i]*result.dpr-result.backing[i])<1e-6,'CSS presentation preserves the allocated backing extent');
    assert.ok(Math.abs(result.physicalOrigin[i]-Math.round(result.physicalOrigin[i]))<.03,'Output origin is device-aligned within browser CSS layout precision');
  }
  assert.ok(Math.abs(result.nativeOrigin[1]-Math.round(result.nativeOrigin[1]))>.2,'Fixture includes the actual fractional native bottom-player origin');
  assert.deepEqual(result.hitOrigin,result.nativeOrigin); assert.equal(result.hitHeight,result.sourceHeight,'Overlay hit geometry remains in native viewport space');
  await api.js("playerBar.renderer.source.style.height='0px'"); await wait(api,"playerBar.renderer.canvas.style.height==='0px'");
  assert.equal(await api.js("playerBar.dom.querySelector('.dom-canvas-scrollbars').style.display"),'none');
  await api.js("playerBar.renderer.source.style.height=''"); await wait(api,"playerBar.renderer.canvas.style.height==='70.4px'"); await delay(150);
  assert.ok(await api.js("sceneInk(playerBar.renderer,playerBar.dom.querySelector('.track-info')).ink")>100,'A resumed unchanged backing restores visible text and its allocated CSS extent');
});
