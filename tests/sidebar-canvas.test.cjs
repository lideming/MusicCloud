// Build first: pnpm run build:bundle
// Run: node --test tests/sidebar-canvas.test.cjs (Node 22+, Chromium).
// Set CHROMIUM_PATH and TMPDIR when the environment requires custom paths.
// Exercises the real production entry point, without a backend or account.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const ts = require('typescript');
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
  const server = http.createServer((req, res) => {
    if (req.url === '/avatar.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>'); return;
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
  const proc = spawn(chromium, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0', `--user-data-dir=${directory}/profile`, 'about:blank']);
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
  await api.call('Page.enable'); await api.call('Network.enable');
  await api.call('Network.setBypassServiceWorker', { bypass: true });
  await api.call('Emulation.setDeviceMetricsOverride', { width: 393, height: 759, deviceScaleFactor: 2, mobile: true });
  await api.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await api.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  for (let i = 0; i < 100; i++) { if (await api.js('Boolean(window.mcloud?.listIndex.section)')) break; if (i === 99) throw Error('App initialization timeout'); await delay(100); }
  await api.js(`(async () => {
    mcloud.user.closeUI(); mcloud.playerCore.pause(); mcloud.ui.theme.set('light-rounded');
    mcloud.listIndex.setIndex({lists:Array.from({length:120},(_,i)=>({id:900000+i,owner:0,visibility:i%4===0?1:0,ownerName:'Owner',version:0,name:['普通歌单 Plain playlist','日本語の音楽 🎵','Long playlist title with enough text to wrap naturally across several lines'][i%3]+' '+i}))});
    mcloud.listIndex.getViewItem(900001).updateWith({playing:true});
    mcloud.ui.sidebarList.setActive(mcloud.listIndex.getViewItem(900002));
    window.clicked=[]; mcloud.listIndex.showTracklist=id=>clicked.push(id);
    mcloud.ui.sidebar.toggleHide(false); await new Promise(r=>setTimeout(r,1200));
  })()`);
  return { api, requests };
}

// Measure real browser-composited pixels, not a computed-style claim. This is
// test-only screenshot inspection; the renderer never reads back the page.
async function backdropContrast(api) {
  const screenshot = await api.call('Page.captureScreenshot', { format: 'png', clip: { x: 140, y: 350, width: 80, height: 20, scale: 1 } });
  return api.js(`(async()=>{const image=new Image();image.src='data:image/png;base64,${screenshot.data}';await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,Math.floor(image.height/2),image.width,1).data;let contrast=0;for(let x=2;x<image.width-2;x++)contrast+=Math.abs(data[x*4]-data[(x-1)*4])+Math.abs(data[x*4+2]-data[(x-1)*4+2]);return contrast/(image.width-4)})()`);
}

const supported = fs.existsSync(chromium);
test('production sidebar paints, reuses resources, routes native hits and restores DOM', { skip: !supported, timeout: 60000 }, async t => {
  const { api, requests } = await browser(t);
  const initial = await api.js(`(() => {
    const renderer=mcloud.ui.sidebar.renderer, gl=renderer.canvas.getContext('webgl');
    const row=document.querySelector('#sidebar-list li'), r=row.getBoundingClientRect(), origin=mcloud.ui.sidebar.dom.getBoundingClientRect();
    const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4); gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let ink=0; for(let y=Math.ceil(r.top-origin.top+4);y<Math.floor(r.bottom-origin.top-4);y++) for(let x=215;x<420;x++) if(pixels[((gl.drawingBufferHeight-1-y*2)*gl.drawingBufferWidth+x*2)*4+3]) ink++;
    return {active:mcloud.ui.sidebar.dom.hasAttribute('data-canvas-rendered'),sourceOpacity:getComputedStyle(mcloud.ui.sidebar.dom).opacity,rootAlpha:getComputedStyle(row).opacity,context:!gl.isContextLost(),ink,stats:{...renderer.stats}};
  })()`);
  assert.equal(initial.active, true); assert.equal(initial.sourceOpacity, '0'); assert.equal(initial.rootAlpha, '1'); assert.equal(initial.context, true); assert.ok(initial.ink > 100, 'Unselected playlist text is actually present on the WebGL canvas');
  assert.ok(initial.stats.cachedResources < 30, 'Only visible/nearby rows are cached');
  assert.deepEqual(await api.js(`['#sidebar-header','#sidebar-list .section-header'].map(selector=>document.querySelector(selector).getAttribute('data-canvas-blur'))`), ['#sidebar-list ul, #sidebar-features', '#sidebar-list ul'], 'Both production header effects are real DOM attributes');
  const material = await api.js(`(()=>{const e=document.querySelector('.sidebar-material'),r=e.getBoundingClientRect(),style=getComputedStyle(e);return {filter:style.backdropFilter,tint:style.backgroundColor,x:r.x,bottom:r.bottom,source:getComputedStyle(mcloud.ui.sidebar.dom).backgroundColor,headerFilter:getComputedStyle(document.querySelector('#sidebar-header')).backdropFilter}})()`);
  assert.notEqual(material.filter, 'none'); assert.equal(material.source, 'rgba(0, 0, 0, 0)'); assert.equal(material.headerFilter, 'none');
  const transparentBackgrounds = () => api.js(`['.sidebar-material','#sidebar-header','#sidebar-list .section-header'].map(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor)`);
  const checkGlobalItemStates = async () => {
    await api.js(`window.itemStyleProbe=document.createElement('div');itemStyleProbe.id='item-style-probe';itemStyleProbe.className='item';document.body.appendChild(itemStyleProbe)`);
    const { root: documentNode } = await api.call('DOM.getDocument');
    const { nodeId } = await api.call('DOM.querySelector', { nodeId: documentNode.nodeId, selector: '#item-style-probe' });
    const colors = [];
    for (const forcedPseudoClasses of [['hover'], ['hover', 'active']]) {
      await api.call('CSS.forcePseudoState', { nodeId, forcedPseudoClasses });
      colors.push(await api.js('getComputedStyle(itemStyleProbe).backgroundColor'));
    }
    await api.call('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    await api.js('itemStyleProbe.classList.add("active")');
    colors.push(await api.js('getComputedStyle(itemStyleProbe).backgroundColor'));
    await api.js('itemStyleProbe.remove()');
    const alphas = colors.map(color => color.startsWith('rgba(') ? Number(color.slice(5, -1).split(',')[3]) : 1);
    assert.ok(alphas.every(alpha => alpha > 0 && alpha < 1), `Global hover/pressed/selected backgrounds are translucent: ${colors}`);
    assert.ok(alphas[1] > alphas[0]); assert.equal(colors[1], colors[2]);
  };
  await api.call('DOM.enable'); await api.call('CSS.enable');
  await checkGlobalItemStates();
  assert.deepEqual(await transparentBackgrounds(), ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  assert.equal(material.x, 0, 'Mobile gesture padding is outside the painted material');
  assert.equal(material.bottom, 679, 'Native material stops above the bottom player');
  const idle = await api.js(`({...mcloud.ui.sidebar.renderer.stats})`); await delay(300);
  assert.deepEqual(await api.js(`({...mcloud.ui.sidebar.renderer.stats})`), idle, 'Idle has no animation or invalidation loop');

  // Native sticky/header placement changes cannot rerasterize every list row.
  await api.js('mcloud.ui.sidebar.dom.scrollTop=150'); await delay(300);
  const beforeScroll = await api.js(`({...mcloud.ui.sidebar.renderer.stats})`);
  await api.js('mcloud.ui.sidebar.dom.scrollTop=151'); await delay(200);
  const afterScroll = await api.js(`({...mcloud.ui.sidebar.renderer.stats})`);
  assert.equal(afterScroll.rasterizations, beforeScroll.rasterizations, 'A one-pixel scroll reuses all row/control rasters');
  const panBefore = afterScroll.rasterizations;
  await api.js(`(async()=>{const shell=mcloud.ui.sidebar.shell;for(let i=0;i<8;i++){shell.style.transform='translate('+(-i*3)+'px,0)';shell.style.transition='none';shell.style.boxShadow='0 0 20px var(--color-shadow)';await new Promise(requestAnimationFrame)}shell.style.transform='';shell.style.transition='';shell.style.boxShadow='';})()`);
  await delay(100);
  assert.equal((await api.js(`({...mcloud.ui.sidebar.renderer.stats})`)).rasterizations, panBefore, 'Shared shell pan does not rerasterize controls');

  // The actual top header must execute its declared regional content blur.
  const edgeVariation = `(()=>{const gl=mcloud.ui.sidebar.renderer.canvas.getContext('webgl'),dpr=gl.drawingBufferWidth/mcloud.ui.sidebar.dom.clientWidth,data=new Uint8Array(400*4);gl.readPixels(Math.floor(220*dpr),gl.drawingBufferHeight-1-Math.floor(47*dpr),400,1,gl.RGBA,gl.UNSIGNED_BYTE,data);let total=0;for(let i=1;i<400;i++)total+=Math.abs(data[i*4+3]-data[(i-1)*4+3]);return total})()`;
  const filteredEdges = await api.js(edgeVariation);
  await api.js(`document.querySelector('#sidebar-header').removeAttribute('data-canvas-blur')`); await delay(200);
  const sharpEdges = await api.js(edgeVariation);
  await api.js(`document.querySelector('#sidebar-header').setAttribute('data-canvas-blur','#sidebar-list ul, #sidebar-features')`); await delay(200);
  assert.ok(sharpEdges > filteredEdges * 1.5, `The production header blurs underlying content edges: ${filteredEdges} vs ${sharpEdges}`);
  const hit = await api.js(`(()=>{const rows=[...document.querySelectorAll('#sidebar-list li')],row=rows.find(e=>{let r=e.getBoundingClientRect();return r.top>180&&r.bottom<550&&!e.classList.contains('active')}),r=row.getBoundingClientRect();return {x:r.left+60,y:r.top+r.height/2,id:900000+rows.indexOf(row),hit:document.elementFromPoint(r.left+60,r.top+r.height/2).closest('li')===row}})()`);
  assert.ok(hit.hit);
  await api.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hit.x, y: hit.y }); await delay(100);
  assert.match(await api.js(`getComputedStyle(mcloud.listIndex.getViewItem(${hit.id}).dom).backgroundColor`), /^rgba\(/, 'Sidebar hover uses the global translucent palette');
  await api.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', buttons: 1, clickCount: 1 }); await delay(80);
  const pressed = await api.js(`(()=>{const e=mcloud.listIndex.getViewItem(${hit.id}).dom,s=getComputedStyle(e);return {active:e.matches(':active'),opacity:Number(s.opacity),transform:s.transform}})()`);
  assert.ok(pressed.active && pressed.opacity < 1 && pressed.transform !== 'none');
  await api.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', buttons: 0, clickCount: 1 }); await delay(700);
  assert.equal(await api.js('clicked.at(-1)'), hit.id);
  const beforeUpdate = await api.js('mcloud.ui.sidebar.renderer.stats.rasterizations');
  await api.js(`mcloud.listIndex.onInfoChanged(${hit.id},{name:'Changed dynamically 中文 / 日本語 🎵'});mcloud.listIndex.getViewItem(${hit.id}).updateWith({playing:true});`); await delay(300);
  assert.ok(await api.js('mcloud.ui.sidebar.renderer.stats.rasterizations') > beforeUpdate);
  assert.ok(await api.js(`mcloud.listIndex.getViewItem(${hit.id}).dom.textContent.includes('Changed dynamically')`));
  await api.js('mcloud.ui.theme.set("dark-rounded")'); await delay(700);
  await checkGlobalItemStates();
  assert.deepEqual(await transparentBackgrounds(), ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  assert.equal(await api.js('mcloud.ui.sidebar.dom.hasAttribute("data-canvas-rendered")'), true);
  // Login-name/avatar changes use the same production DOM path, without login.
  await api.js(`mcloud.user.info.username='Canvas account';mcloud.user.info.avatar='/avatar.svg';mcloud.user.setState('logged');`); await delay(400);
  assert.equal(await api.js('document.querySelector("#login-state .user-name").textContent'), 'Canvas account');
  assert.equal(await api.js('mcloud.ui.sidebar.dom.hasAttribute("data-canvas-rendered")'), true);
  await api.js('mcloud.listIndex.setIndex(null)'); await delay(250);
  assert.ok(await api.js('mcloud.ui.sidebar.renderer.stats.cachedResources') < 6);
  assert.ok(requests.every(method => method === 'GET'), 'No API account writes');

  // Put high-contrast real main-page DOM behind the floating sidebar. The
  // native material must blur it while the Canvas stays transparent here.
  await api.js(`mcloud.ui.theme.set('light-rounded');mcloud.ui.content.container.dom.style.background='repeating-linear-gradient(90deg, #ee0000 0 5px, #001eee 5px 10px)'`); await delay(800);
  const transparent = await api.js(`(()=>{const gl=mcloud.ui.sidebar.renderer.canvas.getContext('webgl'),p=new Uint8Array(4);gl.readPixels(600,gl.drawingBufferHeight-700,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return p[3]})()`);
  assert.equal(transparent, 0, 'External material/background pixels are absent from Canvas output');
  const blurred = await backdropContrast(api);
  await api.js(`document.querySelector('.sidebar-material').style.backdropFilter='none'`); await delay(100);
  const sharp = await backdropContrast(api);
  await api.js(`document.querySelector('.sidebar-material').style.removeProperty('backdrop-filter')`);
  assert.ok(sharp > 2 && blurred < sharp / 2, `Native backdrop visibly reduces underlying stripe contrast: ${blurred} vs ${sharp}`);

  // Disposal and actual context loss both restore ordinary DOM painting.
  await api.js(`window.savedRenderer=mcloud.ui.sidebar.renderer;savedRenderer.dispose()`);
  assert.deepEqual(await api.js(`({active:mcloud.ui.sidebar.dom.hasAttribute('data-canvas-rendered'),opacity:getComputedStyle(mcloud.ui.sidebar.dom).opacity,canvas:!!document.querySelector('.sidebar-canvas')})`), { active: false, opacity: '1', canvas: false });
  assert.deepEqual(await api.js(`(()=>{const style=getComputedStyle(document.querySelector('.sidebar-material'));return {filter:style.backdropFilter,tint:style.backgroundColor,source:getComputedStyle(mcloud.ui.sidebar.dom).backgroundColor}})()`), { filter: material.filter, tint: material.tint, source: 'rgba(0, 0, 0, 0)' }, 'Disposal retains native material and restores readable content without an opaque root background');
  // Construct a fresh instance through its original constructor/binding inputs.
  await api.js(`window.restoredRenderer=new savedRenderer.constructor(savedRenderer.source,savedRenderer.shell);restoredRenderer.canvas.classList.add('sidebar-canvas')`); await delay(300);
  assert.equal(await api.js('mcloud.ui.sidebar.dom.hasAttribute("data-canvas-rendered")'), true);
  await api.js(`restoredRenderer.canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext()`); await delay(150);
  assert.equal(await api.js('getComputedStyle(mcloud.ui.sidebar.dom).opacity'), '1');
  assert.equal(await api.js('Boolean(document.querySelector(".sidebar-canvas"))'), false);

  // The same constructor paints unrelated ordinary DOM/CSS with no binding,
  // application classes or effect attributes. z-index belongs to flex items,
  // and nested stacking contexts and group opacity retain their hierarchy.
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 2, mobile: false });
  await api.js(`const host=document.createElement('section');Object.assign(host.style,{position:'fixed',left:'500px',top:'20px',width:'300px',height:'200px',zIndex:'1000'});const source=document.createElement('article');Object.assign(source.style,{position:'absolute',inset:'0',overflow:'auto'});host.append(source);document.body.append(host);window.unrelatedHost=host;window.unrelatedSource=source;source.innerHTML='<div style="display:flex;width:240px;height:120px"><div style="width:140px;height:100px;flex-shrink:0;z-index:2;background:red"></div><div style="width:140px;height:100px;flex-shrink:0;z-index:1;margin-left:-100px;background:blue"></div></div>';window.unrelatedRenderer=new savedRenderer.constructor(source,host);`); await delay(300);
  const sample = `(()=>{const gl=unrelatedRenderer.canvas.getContext('webgl'),dpr=gl.drawingBufferWidth/unrelatedSource.clientWidth,p=new Uint8Array(4);gl.readPixels(Math.floor(60*dpr),gl.drawingBufferHeight-1-Math.floor(50*dpr),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p]})()`;
  assert.deepEqual(await api.js(sample), [255, 0, 0, 255], 'Static flex items use z-index through their parent layout');
  await api.js(`unrelatedSource.innerHTML='<div style="position:absolute;z-index:1;left:0;top:0;width:180px;height:130px;background:red"><div style="position:absolute;z-index:999;inset:10px;background:blue"></div></div><div style="position:absolute;z-index:2;left:40px;top:20px;width:100px;height:80px;background:#00cc00"></div>'`); await delay(250);
  assert.deepEqual(await api.js(sample), [0, 204, 0, 255], 'A descendant context cannot escape its parent context');
  await api.js('unrelatedSource.style.opacity=".5"'); await delay(200);
  assert.deepEqual(await api.js(sample), [0, 102, 0, 128], 'Source-root opacity applies once after all overlapping paint units');
  await api.js('unrelatedSource.style.opacity=""');
  await api.js(`unrelatedSource.innerHTML='<div style="position:relative;width:200px;height:160px;opacity:.5;background:red"><div style="position:absolute;z-index:999;inset:10px;background:blue"></div></div>'`); await delay(250);
  assert.deepEqual(await api.js(sample), [0, 0, 128, 128], 'Opacity composites the completed context across resource boundaries');
  await api.js(`unrelatedSource.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="70"><rect width="120" height="70" fill="red"/></svg>'`); await delay(350);
  assert.equal(await api.js('unrelatedRenderer.canvas.isConnected && unrelatedSource.hasAttribute("data-canvas-rendered")'), true, 'A direct SVG paint unit survives image decode');
  assert.deepEqual(await api.js(sample), [255, 0, 0, 255], 'Standalone SVG content reaches the actual WebGL surface');
  await api.js('unrelatedRenderer.dispose();unrelatedHost.remove()');
});

test('mobile scrim follows the sidebar without dimming its backdrop', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.js(`const backdrop=document.createElement('div');backdrop.style.cssText='position:absolute;inset:0;background:rgb(200,200,200);z-index:98;pointer-events:none';mcloud.ui.mainContainer.dom.appendChild(backdrop);mcloud.ui.sidebar.renderer.canvas.style.visibility='hidden'`);
  const samples = async () => {
    const shot = await api.call('Page.captureScreenshot', { format: 'png' });
    return api.js(`(async()=>{const image=new Image();image.src='data:image/png;base64,${shot.data}';await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return [50,350].map(x=>ctx.getImageData(Math.floor(x*image.width/393),Math.floor(300*image.width/393),1,1).data[0])})()`);
  };
  const aligned = async () => {
    const geometry = await api.js(`({edge:mcloud.ui.sidebar.shell.getBoundingClientRect().right,start:mcloud.ui.sidebar.overlay.dom.getBoundingClientRect().left})`);
    assert.ok(Math.abs(geometry.edge - geometry.start) < 1, 'Scrim follows the actual sidebar edge');
    return geometry;
  };
  for (const theme of ['light-rounded', 'dark-rounded']) {
    await api.js(`mcloud.ui.theme.set('${theme}')`); await delay(800);
    const [inside, outside] = await samples();
    assert.ok(inside >= 195, `Sidebar backdrop stays undimmed in ${theme}: ${inside}`);
    assert.ok(outside < 180, `Outside content remains dimmed in ${theme}: ${outside}`);
    await aligned();
  }
  await api.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 400 }] });
  for (let x = 90; x >= 20; x -= 10) {
    await api.call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 400 }] }); await delay(20);
  }
  const duringPan = await aligned(); assert.ok(duringPan.edge > 50 && duringPan.edge < 240, `Partial touch pan moved the sidebar: ${JSON.stringify(duringPan)}`);
  assert.ok((await samples())[0] >= 195, 'Dragging does not bring the scrim behind the glass');
  await api.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(400);
  await api.js('mcloud.ui.sidebar.toggleHide(false)'); await delay(400);
  for (const type of ['mousePressed', 'mouseReleased']) await api.call('Input.dispatchMouseEvent', { type, x: 350, y: 300, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await delay(400);
  assert.equal(await api.js('mcloud.ui.sidebar.hide && !mcloud.ui.sidebar.overlay'), true, 'Clicking outside closes the sidebar');
  assert.equal(await api.js('document.querySelectorAll(".sidebar-overlay").length'), 0, 'The faded scrim is removed');
  assert.ok((await samples()).every(value => value >= 195), 'Closing removes all dimming');
});

test('overlay scrollbars share painted/input geometry and restore native viewports', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  await api.js(`window.ScrollRenderer=mcloud.ui.sidebar.renderer.constructor;mcloud.ui.sidebar.renderer.dispose();
    const s=mcloud.ui.sidebar.dom;s.style.setProperty('scrollbar-width','thin','important');s.style.setProperty('scrollbar-gutter','stable','important');`);
  const geometry = () => api.js(`(()=>{const s=mcloud.ui.sidebar.dom,r=s.getBoundingClientRect(),c=mcloud.ui.sidebar.renderer.canvas.getBoundingClientRect();return {outer:s.offsetWidth,client:s.clientWidth,right:r.right,canvasRight:c.right,height:s.clientHeight,top:s.scrollTop,opacity:getComputedStyle(s).opacity,style:s.getAttribute('style'),declaration:s.getAttribute('data-canvas-scrollbar'),controls:document.querySelectorAll('#sidebar-shell .dom-canvas-scrollbars').length}})()`);
  const native = await geometry(); assert.equal(native.outer - native.client, 10, 'Desktop Chromium starts with a real thin native gutter');
  await api.js('mcloud.ui.sidebar.renderer=new ScrollRenderer(mcloud.ui.sidebar.dom,mcloud.ui.sidebar.shell)'); await delay(300);
  const overlay = await geometry(); assert.equal(overlay.outer, overlay.client); assert.equal(overlay.right, overlay.canvasRight);
  const rect = selector => api.js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  const rootTrack = '#sidebar-shell [data-canvas-scrollbar-axis="vertical"]';
  const thumb = await rect(rootTrack + ' [data-canvas-scrollbar-thumb]');
  assert.ok(await api.js(`(()=>{const gl=mcloud.ui.sidebar.renderer.canvas.getContext('webgl'),s=mcloud.ui.sidebar.dom,r=s.getBoundingClientRect(),p=new Uint8Array(4);gl.readPixels(Math.floor(${thumb.x + thumb.width / 2}-r.x),gl.drawingBufferHeight-1-Math.floor(${thumb.y + thumb.height / 2}-r.y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return p[3]>0})()`), 'The actual hit thumb center is painted on the GPU');
  async function drag(r, dx, dy, touch = false, cancel = false) {
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (touch) await api.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    else await api.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      if (touch) await api.call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }] });
      else await api.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx * i / 8, y: y + dy * i / 8, button: 'left', buttons: 1 });
      await delay(15);
    }
    if (touch) await api.call('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    else await api.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y: y + dy, button: 'left', buttons: 0, clickCount: 1 });
    await delay(150);
  }
  await drag(thumb, 0, 160);
  assert.ok((await geometry()).top > 200); assert.deepEqual(await api.js('clicked'), [], 'Captured thumb drag never activates a row');
  await api.js('mcloud.ui.sidebar.dom.scrollTop=0'); await delay(100);
  const track = await rect(rootTrack), tx = track.x + track.width / 2, ty = track.y + track.height * .7;
  for (const type of ['mousePressed', 'mouseReleased']) await api.call('Input.dispatchMouseEvent', { type, x: tx, y: ty, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await delay(100); assert.ok((await geometry()).top > 0); assert.deepEqual(await api.js('clicked'), []);
  await api.js('mcloud.ui.sidebar.dom.scrollTop=0'); await delay(100);
  await api.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 100, y: 250, deltaY: 180, deltaX: 0 }); await delay(300);
  assert.ok((await geometry()).top > 0, 'Wheel over ordinary DOM content remains native');
  await api.call('Emulation.setDeviceMetricsOverride', { width: 393, height: 759, deviceScaleFactor: 2, mobile: true });
  await api.js('mcloud.ui.sidebar.toggleHide(false)'); await delay(250);
  const mobile = await geometry(); assert.equal(mobile.outer, mobile.client); assert.equal(mobile.outer, 450); assert.equal(mobile.right, mobile.canvasRight);
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false }); await delay(250);
  const beforeCollapse = await rect(rootTrack + ' [data-canvas-scrollbar-thumb]');
  await api.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: beforeCollapse.x + beforeCollapse.width / 2, y: beforeCollapse.y + beforeCollapse.height / 2, button: 'left', buttons: 1, clickCount: 1 });
  await api.js("mcloud.ui.sidebar.dom.style.height='0px'"); await delay(150);
  assert.equal(await api.js('document.querySelector("#sidebar-shell .dom-canvas-scrollbars").getBoundingClientRect().height'), 0, 'Collapsed viewport hides stale controls and releases capture');
  await api.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: beforeCollapse.x + beforeCollapse.width / 2, y: beforeCollapse.y + beforeCollapse.height / 2, button: 'left', buttons: 0, clickCount: 1 });
  await api.js('mcloud.ui.sidebar.dom.style.removeProperty("height")'); await delay(150);
  assert.ok((await rect(rootTrack)).height > 0);
  await api.js('mcloud.ui.sidebar.renderer.dispose()');
  const disposed = await geometry(); assert.equal(disposed.outer - disposed.client, 10); assert.equal(disposed.opacity, '1'); assert.equal(disposed.controls, 0); assert.equal(disposed.declaration, 'overlay'); assert.equal(disposed.style, native.style, 'Authored inline values/priorities survive takeover');
  await api.js('mcloud.ui.sidebar.renderer=new ScrollRenderer(mcloud.ui.sidebar.dom,mcloud.ui.sidebar.shell)'); await delay(250);
  await api.js('mcloud.ui.sidebar.renderer.canvas.getContext("webgl").getExtension("WEBGL_lose_context").loseContext()'); await delay(150);
  const lost = await geometry(); assert.equal(lost.outer - lost.client, 10); assert.equal(lost.controls, 0); assert.equal(lost.style, native.style); assert.equal(lost.opacity, '1');
  assert.equal(await api.js(`(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl'?null:get.call(this,kind,...args)};try{new ScrollRenderer(mcloud.ui.sidebar.dom,mcloud.ui.sidebar.shell);return false}catch{return true}finally{HTMLCanvasElement.prototype.getContext=get}})()`), true);
  assert.equal((await geometry()).style, native.style, 'Unavailable WebGL never takes native scrollbar ownership');
  await api.js(`window.headerBlur=document.querySelector('#sidebar-header').getAttribute('data-canvas-blur');document.querySelector('#sidebar-header').setAttribute('data-canvas-blur','[');mcloud.ui.sidebar.renderer=new ScrollRenderer(mcloud.ui.sidebar.dom,mcloud.ui.sidebar.shell)`); await delay(200);
  const failed = await geometry(); assert.equal(failed.outer - failed.client, 10); assert.equal(failed.controls, 0); assert.equal(failed.style, native.style); assert.equal(failed.opacity, '1', 'Failed initial paint restores content and native bars');
  await api.js(`document.querySelector('#sidebar-header').setAttribute('data-canvas-blur',headerBlur)`);

  await api.js(`const host=document.createElement('section');Object.assign(host.style,{position:'fixed',left:'500px',top:'30px',width:'320px',height:'320px',zIndex:'1000'});const source=document.createElement('article');Object.assign(source.style,{position:'absolute',inset:'0',overflow:'auto',scrollbarWidth:'thin'});source.setAttribute('data-canvas-scrollbar','overlay');source.innerHTML='<div style="width:800px;height:80px;background:#adf">Horizontal content</div>';host.append(source);document.body.append(host);window.scrollHost=host;window.scrollSource=source;window.genericClicks=[];source.addEventListener('click',()=>genericClicks.push('row'));window.scrollRenderer=new ScrollRenderer(source,host)`); await delay(300);
  const horizontal = '.dom-canvas-scrollbars [data-canvas-scrollbar-axis="horizontal"] [data-canvas-scrollbar-thumb]';
  await drag(await rect(horizontal), 120, 0); assert.ok(await api.js('scrollSource.scrollLeft>100 && scrollSource.scrollTop===0')); assert.deepEqual(await api.js('genericClicks'), []);
  await api.js("scrollSource.style.direction='rtl';scrollSource.scrollLeft=0"); await delay(150);
  const rtlThumb = await rect(horizontal), rtlTrack = await rect('.dom-canvas-scrollbars [data-canvas-scrollbar-axis="horizontal"]');
  assert.ok(Math.abs(rtlThumb.x + rtlThumb.width - rtlTrack.x - rtlTrack.width) < .5, 'Native RTL offset zero places the thumb at the right edge');
  await drag(rtlThumb, -100, 0); assert.ok(await api.js('scrollSource.scrollLeft < -100 && scrollSource.scrollTop===0')); assert.deepEqual(await api.js('genericClicks'), []);
  await api.js("scrollSource.style.direction='ltr'");
  await api.js(`scrollSource.innerHTML='<div id="scroll-child" data-canvas-scrollbar="overlay" tabindex="0" style="position:absolute;left:30px;top:40px;width:230px;height:140px;overflow:auto;scrollbar-width:thin;border:1px solid #557"><div style="height:640px;width:380px">'+Array.from({length:16},(_,i)=>'<div style="height:40px;background:'+(i%2?'rgb(210,60,180)':'rgb(10,200,100)')+'">Nested row '+i+'</div>').join('')+'</div>';window.scrollChild=document.getElementById('scroll-child');scrollSource.scrollLeft=0;scrollSource.scrollTop=0`); await delay(300);
  const sample = `(()=>{const gl=scrollRenderer.canvas.getContext('webgl'),p=new Uint8Array(4);gl.readPixels(130,gl.drawingBufferHeight-1-100,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p]})()`;
  const before = await api.js(sample);
  const nestedThumb = '.dom-canvas-scrollbars [data-canvas-scrollbar-axis="vertical"] [data-canvas-scrollbar-thumb]';
  await drag(await rect(nestedThumb), 0, 75);
  assert.ok(await api.js('scrollChild.scrollTop>100 && scrollSource.scrollTop===0')); assert.notDeepEqual(await api.js(sample), before, 'Nested scroll changes actual clipped Canvas content, not only an offset counter'); assert.deepEqual(await api.js('genericClicks'), []);
  await api.js('scrollChild.scrollTop=0'); await delay(100);
  await api.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await drag(await rect(nestedThumb), 0, 50, true, true); assert.ok(await api.js('scrollChild.scrollTop>0'));
  await api.js('scrollChild.scrollTop=0'); await delay(100);
  await drag(await rect(nestedThumb), 0, 50); assert.ok(await api.js('scrollChild.scrollTop>0'), 'Pointer cancellation releases the previous drag'); assert.deepEqual(await api.js('genericClicks'), []);
  await api.js('scrollChild.scrollTop=0;scrollChild.focus()');
  for (const type of ['keyDown', 'keyUp']) await api.call('Input.dispatchKeyEvent', { type, key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 }); await delay(250);
  assert.ok(await api.js('scrollChild.scrollTop>0'), 'Original scroll element retains keyboard scrolling');
  await api.js(`scrollChild.firstElementChild.style.height='30px';scrollChild.firstElementChild.style.width='100px';scrollChild.firstElementChild.innerHTML='Small content'`); await delay(250);
  assert.equal(await api.js('scrollHost.querySelectorAll("[data-canvas-scrollbar-axis]").length'), 0, 'No phantom input/paint control remains without overflow');
  await api.js('scrollChild.remove()'); await delay(100);
  assert.equal(await api.js('scrollChild.style.getPropertyValue("scrollbar-gutter")'), '', 'Detached nested scroller releases owned overrides'); assert.equal(await api.js('scrollChild.style.scrollbarWidth'), 'thin');
  await api.js('scrollRenderer.dispose()');
  assert.equal(await api.js('scrollHost.children.length'), 1); assert.equal(await api.js('scrollSource.style.scrollbarWidth'), 'thin'); assert.equal(await api.js('scrollSource.style.getPropertyValue("scrollbar-gutter")'), '');
});

test('GPU blur replaces sharp band pixels, excludes background, and preserves crisp foreground', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'src/Infra/CanvasCompositor.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const results = await api.js(`(() => {
    const exports={};(function(exports){${source}\n})(exports);
    const atScale = dpr => {
    const canvas=document.createElement('canvas'), compositor=new exports.CanvasCompositor(canvas);compositor.resize(64,64,dpr);
    const pixels=document.createElement('canvas');pixels.width=pixels.height=64;const ctx=pixels.getContext('2d');ctx.fillStyle='white';ctx.fillRect(20,20,8,8);ctx.fillRect(20,45,8,8);
    const foreground=document.createElement('canvas');foreground.width=64;foreground.height=40;const fg=foreground.getContext('2d');fg.fillStyle='red';fg.fillRect(1,1,2,2);
    const texture=compositor.upload(pixels), header=compositor.upload(foreground);
    compositor.render({shape:[{texture,rect:{x:0,y:0,width:64,height:64},opacity:1}],foreground:[{texture:header,rect:{x:0,y:0,width:64,height:40},opacity:1}]},[
      {kind:'source',source:'shape'},
      {kind:'blur',sources:['shape'],rect:{x:0,y:0,width:64,height:40}},
      {kind:'source',source:'foreground'},
    ]);
    const gl=compositor.gl, size=64*dpr, data=new Uint8Array(size*size*4);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,data);
    const sample=(x,y)=>{const offset=((size-1-Math.floor((y+.5)*dpr))*size+Math.floor((x+.5)*dpr))*4;return [...data.slice(offset,offset+4)]};
    const result={spread:sample(18,24),replaced:sample(24,24),sharp:sample(24,49),background:sample(60,60),foreground:sample(1,1)};compositor.remove(texture);compositor.remove(header);compositor.dispose();return result;
    };
    return [atScale(1),atScale(2)];
  })()`);
  for (const result of results) {
    assert.ok(result.spread[3] > 0, 'Blur spreads beyond the original white shape');
    assert.ok(result.replaced[3] < 240, 'The sharp opaque source is replaced, not retained beneath blur');
    assert.equal(result.sharp[3], 255, 'Pixels outside the visible header band stay sharp');
    assert.deepEqual(result.background, [0, 0, 0, 0], 'No sidebar background enters the list blur input');
    assert.deepEqual(result.foreground, [255, 0, 0, 255], 'Header foreground stays crisp');
  }
  assert.ok(Math.abs(results[0].replaced[3] - results[1].replaced[3]) < 12, 'Blur radius stays in CSS pixels across device pixel ratios');
});

test('GPU preserves aligned raster texels at integer and fractional DPR', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  const results = await api.js(`(() => {
    const Compositor=mcloud.ui.sidebar.renderer.compositor.constructor;
    return [1,1.25,2].map(dpr=>{
      const output=document.createElement('canvas'), compositor=new Compositor(output);compositor.resize(160,80,dpr);
      const input=document.createElement('canvas');input.width=Math.ceil(121*dpr);input.height=Math.ceil(31*dpr);
      const ctx=input.getContext('2d');ctx.fillStyle='black';
      for(let x=10;x<90;x+=8)ctx.fillRect(x*dpr,5*dpr,2*dpr,20*dpr);
      ctx.font=(14*dpr)+'px sans-serif';ctx.fillText('Text',95*dpr,22*dpr);
      const original=ctx.getImageData(0,0,input.width,input.height).data,texture=compositor.upload(input);
      const difference=(x,width,height)=>{
        compositor.render({text:[{texture,rect:{x,y:0,width,height},opacity:1}]},[{kind:'source',source:'text'}]);
        const gl=compositor.gl,pixels=new Uint8Array(output.width*output.height*4);gl.readPixels(0,0,output.width,output.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let max=0;for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++)max=Math.max(max,Math.abs(original[(y*input.width+x)*4+3]-pixels[((output.height-1-y)*output.width+x)*4+3]));
        return max;
      };
      const result={dpr,aligned:difference(0,input.width/dpr,input.height/dpr),squeezed:difference(0,121,31),shifted:difference(.5/dpr,input.width/dpr,input.height/dpr)};
      compositor.remove(texture);compositor.dispose();return result;
    });
  })()`);
  for (const result of results) {
    assert.equal(result.aligned, 0, `Allocated raster extents preserve every alpha texel at DPR ${result.dpr}`);
    assert.ok(result.shifted > 0, 'A half-device-pixel placement reproduces interpolation loss');
  }
  assert.ok(results.find(result => result.dpr === 1.25).squeezed > 0, 'Squeezing ceil padding into logical dimensions reproduces fractional-DPR interpolation');
});

test('fractional layout text retains sharp rasters, transformed geometry and cache reuse', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await api.js(`window.SharpRenderer=mcloud.ui.sidebar.renderer.constructor;mcloud.ui.sidebar.renderer.dispose();
    const host=document.createElement('section');host.style.cssText='position:fixed;left:500px;top:20px;width:280px;height:240px;z-index:1000';
    const source=document.createElement('article');source.style.cssText='position:absolute;inset:0;overflow:auto;font:16px/19.1875px sans-serif;color:black';source.setAttribute('data-canvas-scrollbar','overlay');
    source.innerHTML=Array.from({length:16},(_,i)=>'<div style="'+(i%2?'box-sizing:border-box;width:274px;height:43.1875px':'box-sizing:content-box;width:250px;height:19.1875px')+';padding:8px;border:4px solid transparent;'+(i===0?'box-shadow:rgba(0,0,0,.3) .5px .5px 2.5px;':'')+'">Sharp text 0123456789</div>').join('');
    source.firstElementChild.style.marginTop='2.5px';host.append(source);document.body.append(host);
    window.sharpHost=host;window.sharpSource=source;window.sharpRenderer=new SharpRenderer(source,host);
    const compositor=sharpRenderer.compositor,render=compositor.render;
    compositor.render=function(sources,layers,opacity){window.sharpSources=sources;return render.call(this,sources,layers,opacity)};
  `);
  for (const dpr of [1, 1.25, 2]) {
    await api.call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: dpr, mobile: false });
    await api.js('sharpSource.scrollTop=0;sharpSource.dispatchEvent(new Event("scroll"))'); await delay(250);
    const state = await api.js(`(()=>{
      const renderer=sharpRenderer,row=sharpSource.children[1],resource=renderer.resources.get(row),unit=renderer.tree.byElement.get(row),placement=sharpSources[unit.id][0],rect=row.getBoundingClientRect();
      const gl=renderer.compositor.gl,pixels=new Uint8Array(renderer.canvas.width*renderer.canvas.height*4);gl.readPixels(0,0,renderer.canvas.width,renderer.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const original=resource.canvas.getContext('2d').getImageData(0,0,resource.canvas.width,resource.canvas.height).data;
      const x0=Math.round(placement.rect.x*devicePixelRatio),y0=Math.round(placement.rect.y*devicePixelRatio);let maxAlphaError=0,ink=0;
      for(let y=Math.ceil(12*devicePixelRatio);y<Math.floor(32*devicePixelRatio);y++)for(let x=Math.ceil(12*devicePixelRatio);x<Math.floor(240*devicePixelRatio);x++){
        const alpha=original[(y*resource.canvas.width+x)*4+3];if(alpha)ink++;
        maxAlphaError=Math.max(maxAlphaError,Math.abs(alpha-pixels[((renderer.canvas.height-1-y0-y)*renderer.canvas.width+x0+x)*4+3]));
      }
      const shadow=renderer.decorations.get(sharpSource.firstElementChild),shadowUnit=renderer.tree.byElement.get(sharpSource.firstElementChild),shadowRect=sharpSources[shadowUnit.id+'/shadow'][0].rect;
      window.sharpCachedCanvas=resource.canvas;
      return {dpr:resource.dpr,sizes:[...renderer.resources].slice(0,2).map(([element,r])=>({boxSizing:getComputedStyle(element).boxSizing,layout:[r.snapshot.layoutWidth,r.snapshot.layoutHeight],actual:[element.getBoundingClientRect().width,element.getBoundingClientRect().height]})),raster:[resource.canvas.width,resource.canvas.height],placement:placement.rect,actual:[rect.width,rect.height],maxAlphaError,ink,shadow:{extent:[shadowRect.width,shadowRect.height],pixels:[shadow.pixelWidth,shadow.pixelHeight],offset:[shadow.snapshot.offsetX,shadow.snapshot.offsetY]}};
    })()`);
    assert.equal(state.dpr, dpr, 'A cached raster always uses the current DPR');
    assert.deepEqual(state.sizes.map(size => size.boxSizing), ['content-box', 'border-box']);
    for (const size of state.sizes) {
      assert.deepEqual(size.layout, [274, 43.1875], 'Snapshot dimensions preserve fractional border-box layout');
      assert.deepEqual(size.actual, size.layout, 'Ordinary layout introduces no artificial scale');
    }
    assert.deepEqual(state.raster, [Math.ceil(274 * dpr), Math.ceil(43.1875 * dpr)]);
    assert.equal(state.placement.width * dpr, state.raster[0]); assert.equal(state.placement.height * dpr, state.raster[1]);
    assert.equal(state.placement.x * dpr, Math.round(state.placement.x * dpr)); assert.equal(state.placement.y * dpr, Math.round(state.placement.y * dpr));
    assert.ok(state.ink > 100); assert.equal(state.maxAlphaError, 0, 'Actual WebGL foreground preserves Canvas2D text alpha without extra resampling');
    assert.deepEqual(state.shadow.extent, state.shadow.pixels.map(size => size / dpr), 'Shadow textures preserve the same allocated raster extent');
    assert.ok(state.shadow.offset.every(offset => offset < 0), 'The shadow check includes a nonzero raster offset');

    const before = await api.js('({...sharpRenderer.stats})');
    await api.js('sharpSource.scrollTop=1'); await delay(100);
    await api.js('sharpSource.scrollTop=2;sharpHost.style.transform="translate(.25px,.5px)"'); await delay(100);
    assert.equal(await api.js('sharpRenderer.stats.rasterizations'), before.rasterizations, 'Tiny native scrolls and host pan reuse fractional-size rasters');
    await api.js('sharpSource.children[1].style.transform="translate(.25px,.375px) scale(.97)"'); await delay(100);
    const transformed = await api.js(`(()=>{const r=sharpRenderer,row=sharpSource.children[1],resource=r.resources.get(row),p=sharpSources[r.tree.byElement.get(row).id][0].rect,b=row.getBoundingClientRect(),origin=sharpSource.getBoundingClientRect();return {sameCanvas:resource.canvas===sharpCachedCanvas,rasterizations:r.stats.rasterizations,scale:[p.width/(resource.canvas.width/devicePixelRatio),p.height/(resource.canvas.height/devicePixelRatio)],origin:[p.x,p.y],actualOrigin:[b.x-origin.x,b.y-origin.y]}})()`);
    assert.equal(transformed.sameCanvas, true); assert.equal(transformed.rasterizations, before.rasterizations);
    for (const scale of transformed.scale) assert.ok(Math.abs(scale - .97) < 1e-5, 'Intentional CSS scale changes output geometry');
    for (let i = 0; i < 2; i++) assert.ok(Math.abs(transformed.origin[i] - transformed.actualOrigin[i]) < 1e-5, 'Scaled surfaces retain their fractional placement');
    await api.js('sharpSource.children[1].style.transform="";sharpHost.style.transform=""'); await delay(100);
    assert.equal(await api.js('sharpRenderer.stats.rasterizations'), before.rasterizations, 'Releasing a scale transform reuses the text raster');
    const idle = await api.js('({...sharpRenderer.stats})'); await delay(150);
    assert.deepEqual(await api.js('({...sharpRenderer.stats})'), idle, 'Fractional size comparisons do not cause idle rerasterization');
  }
  await api.js('sharpRenderer.dispose();sharpHost.remove()');
});
