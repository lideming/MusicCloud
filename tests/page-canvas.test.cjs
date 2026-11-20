// Build first: npm run build:bundle
// Run: node --test tests/page-canvas.test.cjs (Node 22+, Chromium).
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
    if (req.url.startsWith('/video.webm')) { const video=fs.readFileSync(path.join(root,'tests/fixtures/video.webm'));res.writeHead(200,{'Content-Type':'video/webm','Content-Length':video.length,'Accept-Ranges':'bytes'});res.end(video);return; }
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
    if (req.url.startsWith('/api/my/store/plugins')) {res.writeHead(200,{'Content-Type':'application/json','x-mcloud-store-fields':'revision=0&visibility=0'});res.end('{"plugins":[]}');return;}
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
  await api.call('Page.addScriptToEvaluateOnNewDocument', {source:`window.canvasWarnings=[];window.canvasErrors=[];addEventListener('error',e=>canvasErrors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>canvasErrors.push(String(e.reason?.stack||e.reason)));const warn=console.warn;console.warn=(...args)=>{canvasWarnings.push(args.map(x=>String(x)).join(' '));warn(...args)}`});
  await api.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  for (let i = 0; i < 100; i++) { if (await api.js('Boolean(window.mcloud?.listIndex.section)')) break; if (i === 99) throw Error('App initialization timeout'); await delay(100); }
  await setupScene(api);
  await api.js(`window.pageRenderer=mcloud.ui.pageCanvas.renderer;window.colorInk=(element)=>{const r=element.getBoundingClientRect(),renderer=mcloud.ui.pageCanvas.renderer,gl=renderer.compositor.gl,dpr=devicePixelRatio,x=Math.max(0,Math.floor(r.left*dpr)),y=Math.max(0,Math.floor(r.top*dpr)),w=Math.max(0,Math.min(renderer.canvas.width-x,Math.floor(r.width*dpr))),h=Math.max(0,Math.min(renderer.canvas.height-y,Math.floor(r.height*dpr))),p=new Uint8Array(w*h*4);if(!w||!h)return 0;gl.readPixels(x,gl.drawingBufferHeight-y-h,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);let ink=0;for(let i=0;i<p.length;i+=4)if(p[i]<120&&p[i+1]<120&&p[i+2]<120&&p[i+3]>200)ink++;return ink}`);
  return { api, requests };
}

async function setupScene(api) {
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
    view.listView.ensureLoaded(list.tracks.length-1);await view.listView.slowLoading;
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
  const windowsVirtualKeyCode=({Enter:13,Escape:27,Tab:9,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39,Space:32,PageDown:34,PageUp:33,Home:36,End:35})[key]||0;
  await api.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, modifiers, windowsVirtualKeyCode });
  await api.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, modifiers, windowsVirtualKeyCode });
}

async function composeInCanvas(api, element) {
  await api.js(`window.compositionTarget=${element};window.compositionRenderer=mcloud.ui.pageCanvas.renderer;window.compositionEvents=[];window.recordComposition=e=>compositionEvents.push({type:e.type,trusted:e.isTrusted,composing:e.isComposing});for(const name of ['compositionstart','compositionend','input'])compositionTarget.addEventListener(name,recordComposition);window.compositionText=()=>compositionTarget.value??compositionTarget.textContent;window.compositionPaint=()=>{const texts=[];const walk=n=>{if(n.text!=null)texts.push(n.text);for(const c of n.children??[])walk(c)};for(const r of compositionRenderer.resources.values())walk(r.snapshot.root);return texts.join('')};`);
  async function retained() {
    assert.equal(await api.js('mcloud.ui.pageCanvas.renderer===compositionRenderer && document.body.hasAttribute("data-canvas-rendered") && compositionRenderer.canvas.style.visibility!=="hidden" && document.querySelectorAll(".page-canvas").length===1 && document.activeElement===compositionTarget'),true,'Composition keeps the same Canvas output and focused native editor');
    assert.equal(await api.js('!(compositionTarget instanceof HTMLTextAreaElement) || compositionTarget.style.getPropertyValue("scrollbar-width")==="none"'),true,'Composition keeps the textarea overlay viewport');
  }
  for (const text of ['nihao','你好']) {
    await api.call('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
    await retained();
    await wait(api,`compositionText().includes(${JSON.stringify(text)}) && compositionPaint().includes(${JSON.stringify(text)})`);
  }
  await api.call('Input.insertText',{text:'你好'});
  await retained();
  await wait(api,'compositionText().includes("你好") && compositionPaint().includes("你好")');
  const committed=await api.js('compositionText()');
  await api.call('Input.imeSetComposition',{text:'取消',selectionStart:2,selectionEnd:2});
  await retained();
  await wait(api,'compositionText().includes("取消") && compositionPaint().includes("取消")');
  await api.call('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});
  await retained();
  await wait(api,'!compositionPaint().includes("取消")');
  assert.equal(await api.js('compositionText()'),committed,'Cancelling composition preserves the committed text');
  const events=await api.js('compositionEvents');
  assert.equal(events.filter(e=>e.type==='compositionstart'&&e.trusted).length,2,JSON.stringify(events));
  assert.equal(events.filter(e=>e.type==='compositionend').length,2,JSON.stringify(events));
  assert.ok(events.some(e=>e.type==='input'&&e.trusted&&e.composing),'The browser emits composing input events');
  await api.js(`for(const name of ['compositionstart','compositionend','input'])compositionTarget.removeEventListener(name,recordComposition)`);
}

test('one page scene paints the real application background, header, list and player', { skip: !supported, timeout: 60000 }, async t => {
  const {api}=await browser(t);
  const state=await api.js(`(()=>{const r=mcloud.ui.pageCanvas.renderer;window.pageRenderer=r;return {active:document.body.hasAttribute('data-canvas-rendered'),disposed:r?.disposed,outputs:document.querySelectorAll('.page-canvas').length,old:document.querySelectorAll('.sidebar-canvas,.list-content-canvas,.player-canvas').length,stats:r?.stats,warnings:canvasWarnings,errors:canvasErrors,resources:[...r.resources.keys()].map(e=>e.id||e.className).slice(0,50)}})()`);
  t.diagnostic(JSON.stringify(state)); assert.equal(state.active,true);assert.equal(state.disposed,false);assert.equal(state.outputs,1);assert.equal(state.old,0);
  const paint=await api.js(`({background:scenePixel(pageRenderer,1190,790),title:colorInk(view.header.dom),row:colorInk(view.listView.get(0).dom),player:colorInk(playerBar.dom)})`);
  t.diagnostic(JSON.stringify(paint));assert.ok(paint.background[3]>200);assert.ok(paint.title>100);assert.ok(paint.row>100);assert.ok(paint.player>10);
  await api.js('window.firstRowCanvas=pageRenderer.resources.get(view.listView.get(0).dom).canvas;view.scrollBox.dom.scrollTop=1');await delay(100);
  await api.js('view.scrollBox.dom.scrollTop=2');await delay(100);
  assert.equal(await api.js('pageRenderer.resources.get(view.listView.get(0).dom).canvas===firstRowCanvas'),true,'Nested native scroll reuses unchanged row paint rather than dirtying the scroll subtree');
  const reads=await api.js(`(()=>{let count=0,built=0,rebuilds=0;const get=window.getComputedStyle,tree=pageRenderer.tree,build=tree.build,rebuild=pageRenderer.rebuild;tree.build=function(...a){built++;return build.apply(this,a)};pageRenderer.rebuild=function(...a){rebuilds++;return rebuild.apply(this,a)};window.getComputedStyle=(...args)=>{count++;return get(...args)};view.scrollBox.dom.scrollTop=view.listView.get(80).dom.offsetTop;return new Promise(resolve=>setTimeout(()=>{window.getComputedStyle=get;tree.build=build;pageRenderer.rebuild=rebuild;resolve({styleReads:count,nodesBuilt:built,rebuilds})},250))})()`);
  t.diagnostic('Nested scroll metadata '+JSON.stringify(reads));assert.equal(reads.rebuilds,0);assert.ok(reads.nodesBuilt<200,'Only the nearby lazy-updated branches are rebuilt: '+JSON.stringify(reads));
  await api.js('view.scrollBox.dom.scrollTop=0');await delay(150);await evidence(api,'main');
  await api.js(`view.listView.get(0).dom.querySelector('.name').textContent='عنوان عربي طويل جدا لاختبار ترتيب النص '.repeat(18)`);await delay(200);
  const clamp=await api.js(`(()=>{const out=[];const walk=n=>{if(n.text!=null)out.push(n.text);for(const c of n.children??[])walk(c)};walk(pageRenderer.resources.get(view.listView.get(0).dom).snapshot.root);return out.filter(t=>t.includes('…'))})()`);assert.equal(clamp.length,1);assert.equal((clamp[0].match(/…/g)||[]).length,1,'A real clamped Arabic title has one ellipsis');

});

async function evidence(api,name){if(!process.env.CANVAS_EVIDENCE_DIR)return;fs.mkdirSync(process.env.CANVAS_EVIDENCE_DIR,{recursive:true});const png=await api.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.CANVAS_EVIDENCE_DIR,name+'.png'),Buffer.from(png.data,'base64'));}

test('page dialogs and context menus paint with Canvas input, selection and renderer preference continuity', {skip:!supported,timeout:60000},async t=>{
  const {api,requests}=await browser(t);
  assert.equal(await api.js('colorInk(view.header.dom)>100 && colorInk(view.listView.get(0).dom.querySelector(".name"))>30'),true,'Real header and row text, not only an opaque page background, is on the output');
  await api.js('window.originalPage=mcloud.ui.pageCanvas.renderer;window.originalSource=view.scrollBox.dom;window.originalAudio=mcloud.playerCore.audio');
  await click(api,await point(api,'view.header.dom.querySelector(".title")'));
  await wait(api,'Boolean(view.header.dom.querySelector("input")) && document.activeElement===view.header.dom.querySelector("input")');
  assert.equal(await api.js('document.body.hasAttribute("data-canvas-rendered") && originalPage.canvas.style.visibility!=="hidden"'),true,'Ordinary title editing keeps the original page suppressed and the single Canvas visible');
  const titleDifference=await nativeCanvasDifference(api,'pageRenderer','view.header.dom.querySelector("input")');t.diagnostic('Focused title native selection '+JSON.stringify(titleDifference));assert.ok(titleDifference.mean<14,JSON.stringify(titleDifference));
  await composeInCanvas(api,'view.header.dom.querySelector("input")');
  await api.js('document.activeElement.select()');
  await api.call('Input.insertText',{text:'Canvas title editing'});
  assert.equal(await api.js('document.activeElement.value'), 'Canvas title editing');
  await click(api,await point(api,'view.header.dom.querySelector(".catalog")'));await wait(api,'document.body.hasAttribute("data-canvas-rendered")');
  assert.equal(await api.js('mcloud.ui.pageCanvas.renderer===originalPage && originalSource===view.scrollBox.dom && originalAudio===mcloud.playerCore.audio'),true);
  // Real ContextMenu is mounted directly to body, outside mainContainer.
  await click(api,await point(api,'view.listView.get(0).dom'),0,'right');
  await wait(api,'Boolean(document.querySelector(".context-menu"))');await delay(250);
  const menu=await api.js(`(()=>{const e=document.querySelector('.context-menu');return {ink:colorInk(e),text:e.textContent,outputs:document.querySelectorAll('.page-canvas').length}})()`);
  t.diagnostic('Page menu: '+JSON.stringify(menu));assert.ok(menu.ink>30);assert.equal(menu.outputs,1);await evidence(api,'context-menu');const menuDifference=await nativeCanvasDifference(api,'pageRenderer','document.querySelector(".context-menu")');t.diagnostic('Context menu native difference '+JSON.stringify(menuDifference));assert.ok(menuDifference.mean<10,JSON.stringify(menuDifference));
  await key(api,'Escape');await delay(250);
  await api.js('mcloud.settingsUI.openUI()');await wait(api,'mcloud.settingsUI.dialog.dom.getAnimations({subtree:true}).every(a=>a.playState!=="running")');
  assert.equal(await api.js('document.body.hasAttribute("data-canvas-rendered")'),true,'Static form fields do not force a dialog into native mode');
  assert.ok(await api.js('colorInk(mcloud.settingsUI.dialog.dom)')>300);await evidence(api,'settings');
  const selection=await api.js(`(()=>{const r=mcloud.settingsUI.dialog.dom.querySelector('.setting-label').getBoundingClientRect();return {x:r.left+2,y:r.top+r.height/2,end:r.right-2}})()`);
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:selection.x,y:selection.y});
  await api.call('Input.dispatchMouseEvent',{type:'mousePressed',x:selection.x,y:selection.y,button:'left',buttons:1,clickCount:1});
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:selection.end,y:selection.y,button:'left',buttons:1});
  await api.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:selection.end,y:selection.y,button:'left',buttons:0});
  await wait(api,'getSelection().toString().length>0 && document.body.hasAttribute("data-canvas-rendered")');
  await api.js('getSelection().removeAllRanges()');await wait(api,'document.body.hasAttribute("data-canvas-rendered")');
  const input=await point(api,'mcloud.settingsUI.dialog.dom.querySelector("input")');await click(api,input);
  await wait(api,'document.body.hasAttribute("data-canvas-rendered")');
  await api.call('Input.insertText',{text:await api.js('location.origin+"/api/"')});assert.equal(await api.js('document.activeElement.value'),await api.js('location.origin+"/api/"'));
  await delay(120);const settingsInputDifference=await nativeCanvasDifference(api,'pageRenderer','document.activeElement');t.diagnostic('Focused Settings input '+JSON.stringify(settingsInputDifference));assert.ok(settingsInputDifference.mean<14,JSON.stringify(settingsInputDifference));
  await api.js('document.activeElement.blur()');await wait(api,'document.body.hasAttribute("data-canvas-rendered")');
  assert.ok(await api.js('colorInk(mcloud.settingsUI.dialog.dom.querySelector("input"))')>10,'Static edited value returns to Canvas');
  const options=`[...mcloud.settingsUI.dialog.dom.querySelectorAll('.setting-item')].find(e=>e.querySelector('.setting-label')?.textContent==='Renderer:').querySelectorAll('.radio-option')`;
  await click(api,await point(api,`(${options})[0]`));await wait(api,'!mcloud.ui.pageCanvas.renderer && !document.querySelector(".page-canvas")');
  await click(api,await point(api,`(${options})[1]`));await wait(api,'document.body.hasAttribute("data-canvas-rendered")');
  assert.equal(await api.js('originalSource===view.scrollBox.dom && originalAudio===mcloud.playerCore.audio'),true);
  await click(api,await point(api,'mcloud.settingsUI.dialog.dom.querySelector("input")'));await wait(api,'document.body.hasAttribute("data-canvas-rendered")');
  await key(api,'Escape');await wait(api,'!document.querySelector(".dialog") && document.body.hasAttribute("data-canvas-rendered")');await delay(350);
  await api.js(`mcloud.webfx.Toast.show('Page compositor toast',2500);void 0`);await delay(150);
  await wait(api,'colorInk([...document.querySelectorAll(".toast")].find(e=>e.textContent.includes("Page compositor toast")))>40');await evidence(api,'toast');const toastDifference=await nativeCanvasDifference(api,'pageRenderer','[...document.querySelectorAll(".toast")].find(e=>e.textContent.includes("Page compositor toast"))');t.diagnostic('Toast native '+JSON.stringify(toastDifference));assert.ok(toastDifference.mean<10,JSON.stringify(toastDifference));
  assert.ok(requests.every(method=>method==='GET'),'No account writes');
});

test('one scene updates real player, background video and Canvas without rerasterizing unchanged list text', {skip:!supported,timeout:60000},async t=>{
  const {api}=await browser(t);
  await api.js('mcloud.playerCore.setTrack(list.tracks[0]);mcloud.playerCore.currentTime=5');await delay(400);
  const before=await api.js('window.rowCanvas=pageRenderer.resources.get(view.listView.get(0).dom).canvas;({frames:pageRenderer.stats.frames})');
  await api.js('mcloud.playerCore.currentTime=35');await delay(250);
  assert.equal(await api.js('pageRenderer.resources.get(view.listView.get(0).dom).canvas===rowCanvas'),true,'Player progress recomposes the page without rerasterizing unchanged row text');
  assert.ok(await api.js('pageRenderer.stats.frames')>before.frames);
  await api.js(`list.tracks[1].infoObj.type='video';list.tracks[1].infoObj.files=[{profile:'',format:'webm',bitrate:80,size:7924}];list.tracks[1].infoObj.url='/video.webm';list.tracks[1].infoObj.length=12;mcloud.playerCore.setTrack(list.tracks[1]);mcloud.playerCore.audio.muted=true;mcloud.playerCore.play();mcloud.ui.contentBg.toggleFullVideo(true)`);
  await delay(800); t.diagnostic('Video state '+JSON.stringify(await api.js('({url:mcloud.playerCore.audio.currentSrc,state:mcloud.playerCore.state,error:mcloud.playerCore.audio.error?.message,ready:mcloud.playerCore.audio.readyState,width:mcloud.playerCore.audio.videoWidth,time:mcloud.playerCore.audio.currentTime,errors:canvasErrors,warnings:canvasWarnings})')));
  await wait(api,'mcloud.playerCore.audio.videoWidth===80 && mcloud.playerCore.audio.currentTime>.2');
  await wait(api,'[...pageRenderer.resources.values()].some(r=>r.snapshot.videos?.includes(mcloud.playerCore.audio))');
  const video=await api.js(`(()=>{const r=pageRenderer.resources.get(mcloud.playerCore.audio);return {size:r&&[r.canvas.width,r.canvas.height],sum:sceneInk(pageRenderer,document.querySelector('.content-bg')).sum,frames:pageRenderer.stats.frames}})()`);await delay(300);
  const after=await api.js(`({sum:sceneInk(pageRenderer,document.querySelector('.content-bg')).sum,frames:pageRenderer.stats.frames})`);
  t.diagnostic('Video frames: '+JSON.stringify({video,after}));assert.ok(after.frames>video.frames);assert.notEqual(after.sum,video.sum,'Decoded same-origin video changes real page pixels');await evidence(api,'video');
  await click(api,await point(api,'playerBar.btnFullscreen.dom'));await wait(api,'document.fullscreenElement===document.documentElement');
  assert.equal(await api.js('document.body.hasAttribute("data-canvas-rendered") && pageRenderer===mcloud.ui.pageCanvas.renderer && document.querySelectorAll(".page-canvas").length===1'),true,'The actual video fullscreen button retains the same App Canvas inside documentElement');
  await api.js('document.exitFullscreen()');await wait(api,'!document.fullscreenElement && document.body.hasAttribute("data-canvas-rendered")');
  await api.js('mcloud.playerCore.pause()');await delay(300);
  const idle=await api.js('({...pageRenderer.stats})');await delay(250);assert.deepEqual(await api.js('({...pageRenderer.stats})'),idle,'Paused video and unchanged page stop scheduling paints');
  await api.js(`mcloud.playerCore.setTrack(list.tracks[0]);window.effectCanvas=document.createElement('canvas');effectCanvas.width=100;effectCanvas.height=40;effectCanvas.style.cssText='position:fixed;left:450px;top:200px;width:100px;height:40px;z-index:9000';document.body.append(effectCanvas);const c=effectCanvas.getContext('2d');c.fillStyle='red';c.fillRect(0,0,100,40);effectCanvas.dispatchEvent(new Event('canvas-content-changed',{bubbles:true}))`);await delay(150);
  const red=await api.js('scenePixel(pageRenderer,470,220)');await api.js(`effectCanvas.getContext('2d').fillStyle='blue';effectCanvas.getContext('2d').fillRect(0,0,100,40);effectCanvas.dispatchEvent(new Event('canvas-content-changed',{bubbles:true}))`);await delay(150);
  assert.ok(red[0]>200);assert.deepEqual(await api.js('scenePixel(pageRenderer,470,220).slice(0,3)'),[0,0,255]);
  await api.js(`effectCanvas.remove();mcloud.playerFX.initAnalyser();let phase=0;mcloud.playerFX.analyser.getFloatTimeDomainData=data=>{const amplitude=.3+.2*Math.sin(++phase*.15);for(let i=0;i<data.length;i++)data[i]=amplitude*Math.sin(i*.03)};mcloud.playerFX.showUI()`);await wait(api,'!!document.querySelector(".dialog canvas")');await api.js('window.fxSource=document.querySelector(".dialog canvas");window.fxNotifications=0;fxSource.addEventListener("canvas-content-changed",()=>fxNotifications++)');await delay(200);
  const fx=await api.js('({frames:pageRenderer.stats.frames,sum:sceneInk(pageRenderer,document.querySelector(".dialog canvas")).sum})');await delay(150);const fxAfter=await api.js('({frames:pageRenderer.stats.frames,sum:sceneInk(pageRenderer,document.querySelector(".dialog canvas")).sum})');assert.ok(fxAfter.frames>fx.frames);assert.notEqual(fxAfter.sum,fx.sum,'The actual FXDialog owner draw notification updates the same page output');await evidence(api,'fx');await key(api,'Escape');await wait(api,'!document.querySelector(".dialog")');await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:1100,y:300});await delay(700);const fxStopped=await api.js('fxNotifications');await delay(250);assert.equal(await api.js('fxNotifications'),fxStopped,'Closed FXDialog stops owner draw notifications');assert.equal(await api.js('pageRenderer.resources.has(fxSource)'),false);

});

test('page scene preserves native row selection, keyboard navigation and production drag reordering', {skip:!supported,timeout:60000},async t=>{
  const {api,requests}=await browser(t);
  const cover = await api.js(`(()=>{const r=view.listView.get(0).dom.querySelector('.pic').getBoundingClientRect();return {center:scenePixel(pageRenderer,r.left+r.width*.2,r.top+r.height*.5),top:scenePixel(pageRenderer,r.left+r.width*.2,r.top+r.height*.1)}})()`);
  assert.ok(cover.center[0] > cover.center[1] + 100); assert.ok(Math.abs(cover.top[0] - cover.top[1]) < 5, 'Non-square cover remains contained, with unpainted letterbox space');
  const row = await point(api, 'view.listView.get(0).dom');
  await click(api, row, 2); await delay(200);
  assert.equal(await api.js('view.listView.get(0).selected'), true, 'Ctrl-click reaches real selection helper');
  const selectedInk = await api.js('sceneInk(pageRenderer,view.listView.get(0).dom).sum');
  await click(api,await point(api,'view.listView.get(0).dom'));await api.js('view.listView.get(0).dom.focus()'); await key(api, 'ArrowDown');
  assert.equal(await api.js('document.activeElement===view.listView.get(1).dom'), true);
  await key(api, 'PageDown');
  assert.equal(await api.js('document.activeElement===view.listView.get(1).dom'), false);
  await api.js('view.scrollBox.dom.scrollTop=0'); await delay(250);
  await click(api, await point(api, 'view.listView.get(1).dom'), 0, 'right'); await delay(200);
  assert.ok(await api.js('Boolean(document.querySelector(".context-menu"))'), 'Native context menu is outside the suppressed viewport');
  await key(api, 'Escape'); await api.js('document.querySelectorAll(".context-menu").forEach(e=>e.remove())');
  // Native events use the production drag manager/reorder handler and marker DOM.
  await api.js(`(()=>{view.listView.selectionHelper.enabled=false;const from=view.listView.get(1).dom,to=view.listView.get(4).dom,r=to.getBoundingClientRect();window.dragData=new DataTransfer();from.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dragData}));to.dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer:dragData,clientX:r.left+80,clientY:r.bottom-5}));})()`); await delay(200);
  const marker = await api.js(`(()=>{const e=document.querySelector('.tracklistview .dragover-placeholder'),r=e?.getBoundingClientRect();return {exists:!!e,ink:e?sceneInk(pageRenderer,{getBoundingClientRect:()=>({left:r.left,top:r.top-2,width:r.width,height:4})}).ink:0}})()`);
  assert.ok(marker.exists && marker.ink > 100, 'The actual CSS drag marker has painted pixels');
  await api.js(`(()=>{const from=view.listView.get(1).dom,to=view.listView.get(4).dom,r=to.getBoundingClientRect();to.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dragData,clientX:r.left+80,clientY:r.bottom-5}));from.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dragData}));})()`); await delay(250);
  assert.equal(await api.js('list.tracks[4].id'), 800001); assert.equal(await api.js('reorders'), 1);
  await api.js(`list.updateTrackInfo(list.tracks[0],{...list.tracks[0].infoObj,name:'Updated name 日本語',thumburl:'/cover.svg?changed'});`); await delay(250);
  assert.equal(await api.js('view.listView.get(0).dom.querySelector(".name").textContent'), 'Updated name 日本語');
  assert.notEqual(await api.js('sceneInk(pageRenderer,view.listView.get(0).dom).sum'), selectedInk);
  assert.ok(requests.every(method=>method==='GET'));
});

test('page player controls retain native play, pause, seeking, volume and short rounded progress', {skip:!supported,timeout:60000},async t=>{
  const {api,requests}=await browser(t);
  await click(api,await point(api,'view.listView.get(0).dom'));await wait(api,'mcloud.playerCore.isPlaying && mcloud.playerCore.audio.readyState>=2 && !playerBar.progressBar.loudnessMap.hidden');
  assert.equal(await api.js('view.curPlaying.current===view.listView.get(0) && !!view.listView.get(0).dom.querySelector(".pos svg")'),true);
  await click(api,await point(api,'playerBar.btnPlay.dom'));await wait(api,'!mcloud.playerCore.isPlaying');
  await api.js('mcloud.playerCore.currentTime=45');await delay(350);assert.match(await api.js('playerBar.lyrics.dom.textContent'),/Second lyric line/);
  const seek=await api.js('(()=>{const r=playerBar.progressBar.refBackground.value.getBoundingClientRect();return {x:r.left+r.width*.75,y:r.top+r.height/2}})()');await click(api,seek);await delay(150);assert.ok(Math.abs(await api.js('mcloud.playerCore.currentTime')-90)<1);
  await api.js('mcloud.playerCore.volume=.6');const volume=await point(api,'playerBar.btnVolume.dom');await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',...volume});await delay(250);assert.equal(await api.js('playerBar.btnVolume.tipView.dom.textContent'),'60%');
  await wait(api,'colorInk(playerBar.btnVolume.tipView.dom)>3');
  await api.call('Input.dispatchMouseEvent',{type:'mouseWheel',...volume,deltaX:0,deltaY:-100});await delay(100);assert.equal(await api.js('mcloud.playerCore.volume'),.65);
  await api.js('playerBar.btnVolume.dom.focus()');await key(api,'ArrowRight');assert.equal(await api.js('mcloud.playerCore.volume'),.66);
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:1100,y:300});await delay(400);
  for(const dpr of [1,1.25]){await api.call('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:dpr,mobile:false});for(const time of [.02,5,90]){await api.js('mcloud.playerCore.currentTime='+time);await delay(150);const difference=await nativeCanvasDifference(api,'pageRenderer','playerBar.progressBar.refBackground.value');t.diagnostic('Actual page progress '+JSON.stringify({dpr,time,...difference}));assert.ok(difference.mean<7,JSON.stringify(difference));}}
  await evidence(api,'player');assert.ok(requests.every(method=>method==='GET'));
});
async function nativeCanvasDifference(api, renderer, element, width, outset = 0) {
  const rect = await api.js(`(()=>{const r=(${element}).getBoundingClientRect();return {x:r.left-${outset},y:r.top-${outset},width:Math.min(r.width,${width || 10000})+${outset*2},height:r.height+${outset*2},scale:1}})()`);
  const canvas = await api.call('Page.captureScreenshot', { format: 'png', clip: rect });
  await api.js(`(${renderer}).canvas.style.visibility='hidden';(${renderer}).source.removeAttribute('data-canvas-rendered')`);
  const native = await api.call('Page.captureScreenshot', { format: 'png', clip: rect });
  await api.js(`(${renderer}).canvas.style.visibility='';(${renderer}).source.setAttribute('data-canvas-rendered','')`);
  if(process.env.CANVAS_EVIDENCE_DIR){fs.mkdirSync(process.env.CANVAS_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.CANVAS_EVIDENCE_DIR,'compare-canvas.png'),Buffer.from(canvas.data,'base64'));fs.writeFileSync(path.join(process.env.CANVAS_EVIDENCE_DIR,'compare-native.png'),Buffer.from(native.data,'base64'));}
  return api.js(`(async()=>{const decode=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return x.getImageData(0,0,c.width,c.height).data};const a=await decode('${canvas.data}'),b=await decode('${native.data}');let error=0,changed=0;for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++)error+=Math.abs(a[i+c]-b[i+c]);if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>60)changed++}return {mean:error/(a.length/4*3),changed,pixels:a.length/4}})()`);
}


test('ordinary lyrics and search routes share the page scene across theme, DPR and mobile sidebar movement', {skip:!supported,timeout:60000},async t=>{
  const {api,requests}=await browser(t);
  await api.js(`(async()=>{await mcloud.playerCore.setTrack(list.tracks[0]);mcloud.router.nav('nowplaying')})()`);await wait(api,'!!document.querySelector(".playingview .lyricsview")');
  await api.js(`mcloud.nowPlaying.view.lyricsView.setLyrics({bpm:null,lang:'ja',translationLang:'zh',lines:[{startTime:0,orderTime:0,rawLine:null,translation:'中文译文 · English translation',spans:[{startTime:0,text:'漢字',ruby:'かんじ',timeStamp:{time:0,beats:null,beatsDiv:null}},{startTime:1,text:' mixed text 🎵',ruby:null,timeStamp:null}]},{startTime:20,orderTime:20,rawLine:null,translation:null,spans:[{startTime:20,text:'Second lyric line',ruby:null,timeStamp:null}]}]});mcloud.nowPlaying.view.lyricsView.setCurrentTime(.5)`);await delay(400);
  await evidence(api,'lyrics');const lyricsDifference=await nativeCanvasDifference(api,'pageRenderer','document.querySelector(".lyrics")');t.diagnostic('Lyric native difference '+JSON.stringify(lyricsDifference));assert.ok(lyricsDifference.mean<10,JSON.stringify(lyricsDifference));const rubyDifference=await nativeCanvasDifference(api,'pageRenderer','document.querySelector(".playingview rt")');t.diagnostic('Ruby native difference '+JSON.stringify(rubyDifference));assert.ok(rubyDifference.mean<12,JSON.stringify(rubyDifference));
  await api.js(`(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('.playingview ruby'));getSelection().removeAllRanges();getSelection().addRange(range)})()`);await delay(120);
  const rubySelectionDifference=await nativeCanvasDifference(api,'pageRenderer','document.querySelector(".playingview ruby")');t.diagnostic('Ruby selection native difference '+JSON.stringify(rubySelectionDifference));assert.ok(rubySelectionDifference.mean<12,JSON.stringify(rubySelectionDifference));
  await api.js('getSelection().removeAllRanges()');
  await api.js('mcloud.lyricsEdit.startEdit(list.tracks[0],'+JSON.stringify('[00:00.00]First lyric line\n[00:20.00]Second lyric line')+')');await wait(api,'!!document.querySelector(".lyricsview.edit .span.ts")');await delay(400);
  const timestampDifference=await nativeCanvasDifference(api,'pageRenderer','document.querySelector(".lyricsview.edit .span.ts")');t.diagnostic('Timestamp native difference '+JSON.stringify(timestampDifference));assert.ok(timestampDifference.mean<12,JSON.stringify(timestampDifference));
  await api.js('mcloud.lyricsEdit.view.setMode("source")');await wait(api,'!!document.querySelector(".lyricsedit textarea")');
  await api.js('window.sourceArea=document.querySelector(".lyricsedit textarea");sourceArea.focus();sourceArea.select()');
  await api.call('Input.insertText',{text:'[00:00.00]First 日本語 lyric line\n'+Array.from({length:64},(_,i)=>'Line '+i+' more text 中文').join('\n')});
  await api.js('sourceArea.setSelectionRange(10,15)');
  await api.call('Input.dispatchKeyEvent',{type:'keyDown',key:'r',code:'KeyR',windowsVirtualKeyCode:82,modifiers:2});await api.call('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82,modifiers:2});
  assert.equal(await api.js('sourceArea.value.includes("[First]{}") && sourceArea.selectionStart===18 && document.body.hasAttribute("data-canvas-rendered")'),true,'Real lyric-source Ctrl+R changes value/caret through the application setRangeText handler without an input event');
  await api.js(`sourceArea.style.setProperty('scrollbar-width','thin','important');sourceArea.style.setProperty('scrollbar-gutter','stable');sourceArea.scrollTop=80`);await delay(180);assert.ok(await api.js('sourceArea.scrollTop')>0);
  const sourceBar=await api.js(`(()=>{const r=pageRenderer,m=r.scrollbars.measurements.find(m=>m.controls.element===sourceArea),b=m?.bars.find(b=>b.axis==='vertical'),o=r.source.getBoundingClientRect();if(!b)return null;const x=o.x+(b.thumb.x+b.thumb.width/2)*r.scrollbars.scaleX,y=o.y+(b.thumb.y+b.thumb.height/2)*r.scrollbars.scaleY;return {x,y,pixel:scenePixel(r,x,y),height:b.thumb.height}})()`);assert.ok(sourceBar,'Real lyric-source textarea has a measured overlay thumb');assert.ok(sourceBar.pixel.slice(0,3).some(v=>v<245),'The real textarea thumb is visible in the GPU output');
  const sourceBeforeDrag=await api.js('({value:sourceArea.value,start:sourceArea.selectionStart,top:sourceArea.scrollTop})');
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:sourceBar.x,y:sourceBar.y});await api.call('Input.dispatchMouseEvent',{type:'mousePressed',x:sourceBar.x,y:sourceBar.y,button:'left',buttons:1,clickCount:1});await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:sourceBar.x,y:sourceBar.y+80,button:'left',buttons:1});await api.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:sourceBar.x,y:sourceBar.y+80,button:'left',buttons:0});await delay(180);
  assert.ok(await api.js('sourceArea.scrollTop')>sourceBeforeDrag.top+50,'Dragging the painted textarea thumb scrolls the original control');assert.equal(await api.js('sourceArea.value'),sourceBeforeDrag.value);assert.equal(await api.js('sourceArea.selectionStart'),sourceBeforeDrag.start);assert.equal(await api.js('document.activeElement===sourceArea && document.body.hasAttribute("data-canvas-rendered")'),true);
  await api.js(`const index=sourceArea.value.indexOf('Line 20');sourceArea.setSelectionRange(index,index+7);sourceArea.scrollTop=400`);await delay(120);
  const sourceDifference=await nativeCanvasDifference(api,'pageRenderer','sourceArea');t.diagnostic('Real scrolled source selection '+JSON.stringify(sourceDifference));assert.ok(sourceDifference.mean<12,JSON.stringify(sourceDifference));await evidence(api,'lyrics-source-editing');
  await api.js('sourceArea.setSelectionRange(sourceArea.selectionEnd,sourceArea.selectionEnd)');await delay(120);const scrolledCaret=await api.js('sceneInk(pageRenderer,sourceArea).sum');await delay(530);assert.notEqual(await api.js('sceneInk(pageRenderer,sourceArea).sum'),scrolledCaret,'The visible caret still blinks in GPU pixels after textarea thumb scrolling');
  await composeInCanvas(api,'sourceArea');
  await api.js('mcloud.settings.renderer.set("dom")');assert.equal(await api.js('sourceArea.style.getPropertyValue("scrollbar-width")==="thin" && sourceArea.style.getPropertyPriority("scrollbar-width")==="important" && sourceArea.style.getPropertyValue("scrollbar-gutter")==="stable"'),true,'Renderer disposal restores authored textarea declarations');
  await api.js('mcloud.settings.renderer.set("canvas");window.pageRenderer=mcloud.ui.pageCanvas.renderer');await wait(api,'document.body.hasAttribute("data-canvas-rendered")');
  await api.js('document.activeElement.blur()');await wait(api,'document.body.hasAttribute("data-canvas-rendered")');await delay(150);assert.ok(await api.js('colorInk(document.querySelector(".lyricsedit textarea"))>40'),'Static real lyric-source textarea values enter the page output');
  await api.js(`mcloud.router.nav('search')`);await wait(api,'!!document.querySelector(".searchbar input")');await delay(350);
  assert.equal(await api.js('mcloud.ui.pageCanvas.renderer===pageRenderer && document.querySelectorAll(".page-canvas").length===1'),true);
  const input=await point(api,'document.querySelector(".searchbar input")');await click(api,input);await delay(100);await wait(api,'document.body.hasAttribute("data-canvas-rendered")');await api.call('Input.insertText',{text:'Search 日本語'});await key(api,'Tab');await wait(api,'document.body.hasAttribute("data-canvas-rendered")');assert.equal(await api.js('document.querySelector(".searchbar input").value'),'Search 日本語');await wait(api,'colorInk(document.querySelector(".searchbar input"))>20');
  await api.js("mcloud.listIndex.showTracklist(700001)");await wait(api,'mcloud.ui.content.current===view');await delay(400);
  for(const [width,dpr,theme]of [[1000,1.25,'dark-rounded'],[390,2,'light-rounded']]){await api.call('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:dpr,mobile:false});await api.js('mcloud.ui.theme.set('+JSON.stringify(theme)+')');await delay(600);assert.equal(await api.js('document.body.hasAttribute("data-canvas-rendered") && !pageRenderer.disposed'),true);assert.equal(await api.js('pageRenderer.canvas.width'),Math.round(width*dpr));await evidence(api,theme+'-'+width);}
  await api.js('mcloud.ui.sidebar.toggleHide(true)');await delay(400);
  await api.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const touch=async(type,x,y)=>api.call('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{id:0,x,y,radiusX:4,radiusY:4,force:1}]});
  await touch('touchStart',24,260);await touch('touchMove',49,264);await delay(150);
  await api.js(`window.panReads=0;window.panStyle=getComputedStyle;window.getComputedStyle=function(...args){panReads++;return panStyle.apply(this,args)};window.panCache=new Map([...pageRenderer.resources].filter(([e])=>e.classList.contains('trackitem')).map(([e,r])=>[e,r.canvas]))`);
  for(let x=74;x<=299;x+=25){await touch('touchMove',x,264);await delay(60)}
  const panWork=await api.js('({reads:panReads,cached:[...panCache].filter(([e,c])=>pageRenderer.resources.get(e)?.canvas===c).length,rows:document.querySelectorAll(".listcontentview .trackitem").length})');await api.js('window.getComputedStyle=panStyle');t.diagnostic('Native touch pan work '+JSON.stringify(panWork));assert.ok(panWork.reads<10000,JSON.stringify(panWork));assert.ok(panWork.cached>2,JSON.stringify(panWork));await evidence(api,'mobile-sidebar-pan');
  await touch('touchEnd');await delay(500);assert.equal(await api.js('mcloud.ui.sidebar.hide'),false);assert.equal(await api.js('document.body.hasAttribute("data-canvas-rendered")'),true);assert.ok(await api.js('colorInk(document.querySelector("#sidebar-features"))>20'));await evidence(api,'mobile-sidebar');assert.ok(requests.every(method=>method==='GET'));
});

test('real list empty/loading/error content paints, retries natively and stops animating after loading', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.js('list.loadFromGetResult({...list.info,tracks:[]});void 0'); await delay(400);
  const empty = await api.js('({ink:sceneInk(pageRenderer,view.emptyIndicator.dom).ink,text:view.emptyIndicator.dom.textContent,rows:[...pageRenderer.resources.keys()].filter(e=>e.classList.contains("trackitem")).length})');
  assert.match(empty.text,/Empty/); assert.ok(empty.ink>40 && empty.rows===0,JSON.stringify(empty));
  await api.js('window.loading=new mcloud.webfx.LoadingIndicator();view.useLoadingIndicator(loading)'); await delay(1400);
  await api.js(`window.readScene=renderer=>{const gl=renderer.canvas.getContext('webgl'),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p};window.loadingBefore=readScene(pageRenderer);window.loadingFrames=pageRenderer.stats.frames`);
  await delay(90);
  const animated = await api.js(`(()=>{const after=readScene(pageRenderer);let changed=0;for(let i=0;i<after.length;i++)if(after[i]!==loadingBefore[i])changed++;return {changed,frames:pageRenderer.stats.frames-loadingFrames}})()`);
  assert.ok(animated.changed>20 && animated.frames>0,JSON.stringify(animated));
  await api.js(`window.retries=0;loading.error('Fixture failure',()=>{retries++;loading.reset()})`); await delay(400);
  const error = await api.js(`(()=>{const p=readScene(pageRenderer);let red=0;for(let i=0;i<p.length;i+=4)if(p[i]>p[i+1]+80&&p[i+3]>20)red++;return {red,text:loading.dom.textContent}})()`);
  assert.ok(error.red>40); assert.match(error.text,/Fixture failure/);
  const stopped = await api.js('({...pageRenderer.stats})'); await delay(250); assert.deepEqual(await api.js('({...pageRenderer.stats})'),stopped,'Error state stops the loading animation frame loop');
  await click(api, await point(api,'loading.dom')); await delay(150); assert.equal(await api.js('retries'),1);
  await api.js('view.useLoadingIndicator(null)'); await delay(400);
  assert.equal(await api.js('view.loadingIndicator===view.emptyIndicator'),true);
});


test('page context loss and failed paint restore the same native DOM and do not retry', {skip:!supported,timeout:60000},async t=>{
 const {api}=await browser(t);await api.js('window.nativeSource=view.scrollBox.dom;window.nativeAudio=mcloud.playerCore.audio;pageRenderer.canvas.getContext("webgl").getExtension("WEBGL_lose_context").loseContext()');
 await wait(api,'!document.body.hasAttribute("data-canvas-rendered") && !document.querySelector(".page-canvas")');assert.equal(await api.js('pageRenderer.resources.size===0 && pageRenderer.stats.cachedResources===0 && nativeSource===view.scrollBox.dom && nativeAudio===mcloud.playerCore.audio'),true);
 await click(api,await point(api,'view.listView.get(1).dom'));await wait(api,'mcloud.playerCore.isPlaying');await api.js('mcloud.playerCore.pause()');await delay(300);assert.equal(await api.js('document.querySelectorAll(".page-canvas").length'),0);
 await api.js('mcloud.settings.renderer.set("dom");view.header.dom.style.backgroundImage="linear-gradient(red, blue)";mcloud.settings.renderer.set("canvas")');await delay(300);await wait(api,'!document.body.hasAttribute("data-canvas-rendered") && !document.querySelector(".page-canvas")');await api.js('view.header.dom.style.removeProperty("background-image")');await delay(250);assert.equal(await api.js('document.querySelectorAll(".page-canvas").length'),0);
 await api.js('mcloud.settings.renderer.set("dom");mcloud.settings.renderer.set("canvas")');await wait(api,'document.body.hasAttribute("data-canvas-rendered")');assert.equal(await api.js('nativeSource===view.scrollBox.dom && nativeAudio===mcloud.playerCore.audio'),true);
 await api.js(`window.corsImage=document.createElement('img');Object.assign(corsImage.style,{position:'fixed',left:'10px',top:'10px',width:'80px',height:'40px'});corsImage.crossOrigin='anonymous';document.body.append(corsImage);corsImage.src='http://localhost:'+location.port+'/cover.svg?cors'`);
 await wait(api,'!document.body.hasAttribute("data-canvas-rendered") && !document.querySelector(".page-canvas")');await api.js('corsImage.remove()');await delay(200);assert.equal(await api.js('document.querySelectorAll(".page-canvas").length'),0,'Removing a CORS failure does not create a retry loop');
 await api.js('mcloud.settings.renderer.set("dom");mcloud.settings.renderer.set("canvas")');await wait(api,'document.body.hasAttribute("data-canvas-rendered")');
 await api.js(`window.corsVideo=document.createElement('video');Object.assign(corsVideo.style,{position:'fixed',left:'10px',top:'10px',width:'80px',height:'40px'});corsVideo.crossOrigin='anonymous';document.body.append(corsVideo);corsVideo.src='http://localhost:'+location.port+'/video.webm';corsVideo.load()`);
 await wait(api,'!document.body.hasAttribute("data-canvas-rendered") && !document.querySelector(".page-canvas")');await api.js('corsVideo.remove()');assert.equal(await api.js('nativeSource===view.scrollBox.dom && nativeAudio===mcloud.playerCore.audio'),true);

});

test('page Canvas paints browser-owned cross-node selections, textarea scrolling and contenteditable carets locally', {skip:!supported,timeout:60000},async t=>{
  const {api}=await browser(t);
  await api.call('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1.25,mobile:false});
  await api.js(`window.editFixture=document.createElement('section');editFixture.style.cssText='position:fixed;z-index:9000;left:380px;top:160px;width:420px;padding:16px;background:white;color:black;font:20px/28px Arial';editFixture.innerHTML='<style>.edit-sample::selection,.edit-sample *::selection{background:rgb(25,103,210);color:white}</style><div class="edit-sample" id="selected-copy">Plain <b>日本語 é 🎵</b><br>Second line <span>across nodes</span></div><textarea class="edit-sample" id="edit-area" style="display:block;width:250px;height:85px;box-sizing:border-box;padding:6px;border:1px solid black;font:20px/28px Arial;margin-top:12px;resize:none"></textarea><div class="edit-sample" id="edit-rich" contenteditable="true" style="padding:4px;border:1px solid black;margin-top:12px;min-height:32px">Edit <b>中文</b> text</div>';document.body.append(editFixture);window.area=document.querySelector('#edit-area');window.rich=document.querySelector('#edit-rich');area.value='First 日本語 é 🎵 wraps naturally across several lines.\\nSecond paragraph with long content.\\nThird paragraph.\\nFourth paragraph.';area.dispatchEvent(new Event('input',{bubbles:true}));window.selectionPaint=()=>{const out=[];const walk=n=>{if(n.selection)out.push(n.selection);for(const child of n.children??[])walk(child)};for(const r of pageRenderer.resources.values())walk(r.snapshot.root);return out};`);
  await delay(500);
  await api.js(`window.editRow=pageRenderer.resources.get(view.listView.get(0).dom).canvas;window.fullRebuilds=0;window.editRebuild=pageRenderer.rebuild;pageRenderer.rebuild=function(){fullRebuilds++;return editRebuild.call(this)};const e=document.querySelector('#selected-copy'),r=document.createRange();r.setStart(e.firstChild,2);r.setEnd(e.lastChild.firstChild,7);getSelection().removeAllRanges();getSelection().addRange(r)`);
  await wait(api,'selectionPaint().length>=3');
  assert.equal(await api.js('document.body.hasAttribute("data-canvas-rendered") && document.querySelectorAll(".page-canvas").length===1'),true);
  assert.match(await api.js('getSelection().toString()'),/日本語/);
  const selected=await nativeCanvasDifference(api,'pageRenderer','document.querySelector("#selected-copy")');
  t.diagnostic('Cross-node native selection '+JSON.stringify(selected));assert.ok(selected.mean<10,JSON.stringify(selected));await evidence(api,'editing-cross-node');
  const selectedPixel=await api.js(`({count:selectionPaint().reduce((n,s)=>n+s.rects.length,0),cache:pageRenderer.resources.get(view.listView.get(0).dom).canvas===editRow,rebuilds:fullRebuilds})`);
  assert.ok(selectedPixel.count>=3);assert.equal(selectedPixel.cache,true);assert.equal(selectedPixel.rebuilds,0);
  await api.js('getSelection().removeAllRanges();area.focus();area.setSelectionRange(6,70)');await delay(180);
  assert.equal(await api.js('document.body.hasAttribute("data-canvas-rendered") && selectionPaint().length>0'),true);
  let difference=await nativeCanvasDifference(api,'pageRenderer','area');t.diagnostic('Wrapped textarea native selection '+JSON.stringify(difference));assert.ok(difference.mean<14,JSON.stringify(difference));await evidence(api,'editing-textarea');
  await api.js('area.scrollTop=42');await delay(180);
  difference=await nativeCanvasDifference(api,'pageRenderer','area');t.diagnostic('Scrolled textarea native selection '+JSON.stringify(difference));assert.ok(difference.mean<14,JSON.stringify(difference));
  await api.call('Input.insertText',{text:'Replacement 中文\nnext'});await delay(150);
  assert.equal(await api.js('area.value.includes("Replacement 中文\\nnext")'),true);
  const beforeDelete=await api.js('area.value');await key(api,'ArrowLeft');await key(api,'ArrowLeft',8); // Browser Shift-selection, then deletion.
  await api.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
  await api.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await delay(100);
  assert.notEqual(await api.js('area.value'),beforeDelete);
  await api.call('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});await api.call('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});assert.equal(await api.js('area.value'),beforeDelete,'Browser undo restores the deleted selection');
  assert.equal(await api.js('document.body.hasAttribute("data-canvas-rendered") && !pageRenderer.disposed'),true);
  await api.js(`area.value='A long unwrapped 日本語 line '.repeat(12);area.wrap='off';area.setSelectionRange(32,44);area.scrollLeft=320;area.dispatchEvent(new Event('input',{bubbles:true}))`);await delay(200);
  assert.ok(await api.js('area.scrollLeft')>100);
  difference=await nativeCanvasDifference(api,'pageRenderer','area');t.diagnostic('Horizontal textarea native selection '+JSON.stringify(difference));assert.ok(difference.mean<18,JSON.stringify(difference));

  await api.js(`(()=>{rich.focus();const r=document.createRange();r.setStart(rich.querySelector('b').firstChild,1);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);await delay(120);
  const blinkBefore=await api.js('editRow=pageRenderer.resources.get(view.listView.get(0).dom).canvas;fullRebuilds=0;({...pageRenderer.stats,ink:sceneInk(pageRenderer,rich).sum})');await delay(530);
  assert.notEqual(await api.js('sceneInk(pageRenderer,rich).sum'),blinkBefore.ink,'Caret blinking changes the actual GPU pixels');
  assert.ok(await api.js('pageRenderer.stats.frames')>blinkBefore.frames,'A focused collapsed native selection blinks in the page Canvas');
  t.diagnostic('Edit retention '+JSON.stringify(await api.js('({rebuilds:fullRebuilds,same:pageRenderer.resources.get(view.listView.get(0).dom).canvas===editRow,stats:pageRenderer.stats})')));assert.equal(await api.js('fullRebuilds===0 && pageRenderer.resources.get(view.listView.get(0).dom).canvas===editRow'),true,'Selection and blinking retain list pixels without rebuilding the tree');
  await api.call('Input.insertText',{text:'字'});await api.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await api.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await api.call('Input.insertText',{text:'second 中文'});await delay(150);
  assert.equal(await api.js('rich.innerText.includes("字") && rich.innerText.includes("second 中文") && rich.innerText.includes("\\n")'),true);
  await key(api,'ArrowLeft',8);await delay(80);
  difference=await nativeCanvasDifference(api,'pageRenderer','rich');t.diagnostic('Contenteditable native selection '+JSON.stringify(difference));assert.ok(difference.mean<18,JSON.stringify(difference));await evidence(api,'editing-contenteditable');
  await composeInCanvas(api,'rich');
  await api.js(`(()=>{rich.blur();window.copyScroller=document.createElement('div');copyScroller.style.cssText='height:70px;overflow:auto;position:relative;contain:paint;margin-top:8px';copyScroller.innerHTML=Array.from({length:30},(_,i)=>'<div style="height:28px">Selectable row '+i+'</div>').join('');editFixture.append(copyScroller);const range=document.createRange();range.selectNodeContents(copyScroller);getSelection().removeAllRanges();getSelection().addRange(range)})()`);await delay(180);
  await api.js('copyScroller.scrollTop=400');await delay(180);
  assert.ok(await api.js('selectionPaint().length')>0,'Newly visible selected text is painted during native scrolling');
  await api.js('getSelection().removeAllRanges()');await wait(api,'selectionPaint().length===0');
  await api.js('editFixture.remove()');await delay(400);
  const idle=await api.js('({...pageRenderer.stats})');await delay(700);assert.deepEqual(await api.js('({...pageRenderer.stats})'),idle,'Removed editor cancels caret wakeups and the page returns to idle');
  t.diagnostic('Editing final state '+JSON.stringify(await api.js('({active:document.body.hasAttribute("data-canvas-rendered"),disposed:pageRenderer.disposed,errors:canvasErrors,warnings:canvasWarnings})')));
  assert.equal(await api.js('document.body.hasAttribute("data-canvas-rendered") && !pageRenderer.disposed && canvasErrors.length===0 && !canvasWarnings.some(w=>w.includes("DOMCanvasRenderer"))'),true);
  await api.js('mcloud.settings.renderer.set("dom")');assert.equal(await api.js('document.querySelectorAll("[data-canvas-owned]").length'),0,'Disposal releases the unfocusable layout mirror');
});


test('focus outlines use CSS outer/negative offsets and selected glyphs have one coverage layer', {skip:!supported,timeout:60000},async t=>{
  const {api}=await browser(t);
  await api.js(`window.paintFixture=document.createElement('section');paintFixture.style.cssText='position:fixed;z-index:9000;left:400px;top:180px;width:430px;padding:16px;background:white;color:black;font:24px/36px Arial';paintFixture.innerHTML='<input class="input-text" spellcheck="false" style="position:relative;z-index:1;display:block;box-sizing:border-box;width:240px;height:46px;padding:6px;border:1px solid black;border-radius:0;background:white;outline:2px solid rgb(230,20,20);outline-offset:0;font:20px Arial" value="Focus input"><p id="selection-ink" style="margin:20px 0 0">Hamburgefonts 0123 中文</p><style>#selection-ink::selection{background:white;color:black}#selection-ink.different::selection{color:rgb(240,0,0)}</style>';document.body.append(paintFixture);window.focusInput=paintFixture.querySelector('input');window.selectionInk=paintFixture.querySelector('p');focusInput.focus();focusInput.setSelectionRange(0,0);`);await delay(180);
  const outlinePixels=()=>api.js(`(()=>{const r=focusInput.getBoundingClientRect();return {outside:scenePixel(pageRenderer,r.left-1,r.top+r.height/2),inside:scenePixel(pageRenderer,r.left+1,r.top+r.height/2)}})()`);
  let pixels=await outlinePixels();assert.deepEqual(pixels.outside.slice(0,3),[230,20,20]);assert.deepEqual(pixels.inside.slice(0,3),[255,255,255],'The two-pixel outer outline does not invade the input content');
  let difference=await nativeCanvasDifference(api,'pageRenderer','focusInput',undefined,4);t.diagnostic('Outer focus outline native '+JSON.stringify(difference));assert.ok(difference.mean<5,JSON.stringify(difference));
  await api.js('focusInput.style.outlineOffset="-2px"');await delay(120);pixels=await outlinePixels();assert.deepEqual(pixels.outside.slice(0,3),[255,255,255]);assert.deepEqual(pixels.inside.slice(0,3),[230,20,20],'The negative-offset outline paints inside and above the border');
  difference=await nativeCanvasDifference(api,'pageRenderer','focusInput',undefined,4);t.diagnostic('Inset focus outline native '+JSON.stringify(difference));assert.ok(difference.mean<5,JSON.stringify(difference));
  await api.js('focusInput.style.outlineOffset="0px";focusInput.style.marginLeft="-16px";paintFixture.style.overflow="hidden"');await delay(120);pixels=await outlinePixels();assert.notDeepEqual(pixels.outside.slice(0,3),[230,20,20],'An expanded outline bitmap remains clipped by its overflow ancestor');
  await api.js('focusInput.style.marginLeft="0px";paintFixture.style.overflow="visible"');
  await api.js(`focusInput.blur();window.inkPixels=()=>{const gl=pageRenderer.compositor.gl,r=selectionInk.getBoundingClientRect(),p=new Uint8Array(Math.floor(r.width)*Math.floor(r.height)*4);gl.readPixels(Math.floor(r.x),gl.drawingBufferHeight-Math.floor(r.bottom),Math.floor(r.width),Math.floor(r.height),gl.RGBA,gl.UNSIGNED_BYTE,p);return p};`);await delay(120);
  await api.js(`window.beforeSelectionPixels=inkPixels();(()=>{const range=document.createRange();range.setStart(selectionInk.firstChild,2);range.setEnd(selectionInk.firstChild,10);getSelection().removeAllRanges();getSelection().addRange(range)})()`);await delay(120);

  assert.equal(await api.js('inkPixels().some((v,i)=>v!==beforeSelectionPixels[i])'),false,'Same-color selection leaves every glyph coverage pixel unchanged');
  await api.js('selectionInk.classList.add("different")');await delay(120);
  const foreground=await api.js(`(()=>{const p=inkPixels();let red=0,black=0;for(let i=0;i<p.length;i+=4){if(p[i]>160&&p[i+1]<100&&p[i+2]<100)red++;if(p[i]<80&&p[i+1]<80&&p[i+2]<80)black++}return {red,black}})()`);assert.ok(foreground.red>100 && foreground.black>100,'Selected glyphs use the distinct foreground while unselected text remains black');
  difference=await nativeCanvasDifference(api,'pageRenderer','selectionInk');t.diagnostic('Distinct selection foreground native '+JSON.stringify(difference));assert.ok(difference.mean<2,JSON.stringify(difference));await evidence(api,'selection-foreground');
  await api.js('getSelection().removeAllRanges();paintFixture.remove()');await delay(180);assert.equal(await api.js('!pageRenderer.disposed && document.body.hasAttribute("data-canvas-rendered")'),true);
});
