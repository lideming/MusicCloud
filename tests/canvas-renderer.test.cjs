// Build first: pnpm run build:bundle
// Run: node --test tests/canvas-renderer.test.cjs (Node 22+, Chromium).
// Set CHROMIUM_PATH and TMPDIR when the environment requires custom paths.
// Exercises the real production entry point, without a backend or account.
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
  const server = http.createServer((req, res) => {
    if (req.url === '/avatar.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>'); return;
    }
    if (req.url.startsWith('/api/my/store/plugins')) {res.writeHead(200,{'Content-Type':'application/json'});res.end('{"plugins":[]}');return;}
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
  await api.js(`window.GenericRenderer=mcloud.ui.pageCanvas.renderer.constructor;window.Compositor=mcloud.ui.pageCanvas.renderer.compositor.constructor;mcloud.settings.renderer.set("dom")`);
  await api.js(`window.scenePixel=(renderer,x,y)=>{const gl=renderer.compositor.gl,r=renderer.canvas.getBoundingClientRect(),dpr=gl.drawingBufferWidth/r.width,p=new Uint8Array(4);gl.readPixels(Math.floor((x-r.left)*dpr),gl.drawingBufferHeight-1-Math.floor((y-r.top)*dpr),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p]};window.sceneInk=(renderer,element)=>{const gl=renderer.compositor.gl,r=element.getBoundingClientRect(),o=renderer.canvas.getBoundingClientRect(),dpr=gl.drawingBufferWidth/o.width,x=Math.max(0,Math.ceil((r.left-o.left)*dpr)),y=Math.max(0,Math.ceil((r.top-o.top)*dpr)),w=Math.min(gl.drawingBufferWidth-x,Math.floor(r.width*dpr)),h=Math.min(gl.drawingBufferHeight-y,Math.floor(r.height*dpr)),p=new Uint8Array(w*h*4);gl.readPixels(x,gl.drawingBufferHeight-y-h,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);let ink=0,sum=0;for(let i=0;i<p.length;i+=4){if(p[i+3])ink++;sum+=p[i]+p[i+1]+p[i+2]+p[i+3]}return {ink,sum}}`);
  return { api, requests };
}

const supported = fs.existsSync(chromium);
const wait = async (api,expression) => { for(let i=0;i<100;i++){if(await api.js(expression))return;await delay(50)}throw Error('Condition not reached: '+expression); };
test('overlay scrollbars auto-hide, retain a wider hit area and restore native viewports', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false }); await delay(400);
  await api.js(`window.ScrollRenderer=GenericRenderer;
    window.barDocumentClicks=0;document.addEventListener('click',()=>barDocumentClicks++);
    const s=mcloud.ui.sidebar.dom;s.setAttribute('data-canvas-scrollbar','overlay');s.style.setProperty('scrollbar-width','thin','important');s.style.setProperty('scrollbar-gutter','stable','important');`);
  const geometry = () => api.js(`(()=>{const s=mcloud.ui.sidebar.dom,r=s.getBoundingClientRect(),c=window.genericRenderer?.canvas.getBoundingClientRect()??{right:0};return {outer:s.offsetWidth,client:s.clientWidth,right:r.right,canvasRight:c.right,height:s.clientHeight,top:s.scrollTop,opacity:getComputedStyle(s).opacity,style:s.getAttribute('style'),declaration:s.getAttribute('data-canvas-scrollbar'),controls:document.querySelectorAll('#sidebar-shell .dom-canvas-scrollbars').length}})()`);
  const native = await geometry(); assert.equal(native.outer - native.client, 10, 'Desktop Chromium starts with a real thin native gutter');
  await api.js(`genericRenderer=new ScrollRenderer(mcloud.ui.sidebar.dom,mcloud.ui.sidebar.shell);
    new Promise(resolve=>{const source=mcloud.ui.sidebar.dom;if(source.hasAttribute('data-canvas-rendered'))return resolve();const observer=new MutationObserver(()=>{if(source.hasAttribute('data-canvas-rendered')){observer.disconnect();resolve()}});observer.observe(source,{attributes:true,attributeFilter:['data-canvas-rendered']})})`);
  const overlay = await geometry(); assert.equal(overlay.outer, overlay.client); assert.equal(overlay.right, overlay.canvasRight);
  const barRect = (renderer,element,axis,thumb=false) => api.js(`(()=>{const r=${renderer},measurement=r.scrollbars.measurements.find(m=>m.controls.element===${element}),bar=measurement.bars.find(b=>b.axis===${JSON.stringify(axis)}),box=bar[${JSON.stringify(thumb?'thumb':'track')}],origin=r.source.getBoundingClientRect();return {x:origin.x+box.x*r.scrollbars.scaleX,y:origin.y+box.y*r.scrollbars.scaleY,width:box.width*r.scrollbars.scaleX,height:box.height*r.scrollbars.scaleY}})()`);
  const thumb = await barRect('genericRenderer','mcloud.ui.sidebar.dom','vertical',true);
  assert.equal(thumb.width, 6);
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
  await drag(thumb, -100, 160);
  assert.equal(await api.js('barDocumentClicks'),0,'Off-track release consumes the bar gesture click before document listeners');
  assert.ok((await geometry()).top > 200); assert.deepEqual(await api.js('clicked'), [], 'Captured thumb drag never activates a row');
  await api.js('mcloud.ui.sidebar.dom.scrollTop=0'); await delay(100);
  const track = await barRect('genericRenderer','mcloud.ui.sidebar.dom','vertical'), tx = track.x + track.width / 2, ty = track.y + track.height * .7;
  for (const type of ['mousePressed', 'mouseReleased']) await api.call('Input.dispatchMouseEvent', { type, x: tx, y: ty, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await delay(100); assert.ok((await geometry()).top > 0); assert.deepEqual(await api.js('clicked'), []);
  await api.js('mcloud.ui.sidebar.dom.scrollTop=0'); await delay(100);
  await api.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 100, y: 250, deltaY: 180, deltaX: 0 }); await delay(300);
  assert.ok((await geometry()).top > 0, 'Wheel over ordinary DOM content remains native');
  await api.call('Emulation.setDeviceMetricsOverride', { width: 393, height: 759, deviceScaleFactor: 2, mobile: true });
  await api.js('mcloud.ui.sidebar.toggleHide(false)'); await delay(250);
  const mobile = await geometry(); assert.equal(mobile.outer, mobile.client); assert.equal(mobile.outer, 450); assert.equal(mobile.right, mobile.canvasRight);
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false }); await delay(400); await delay(250);
  const beforeCollapse = await barRect('genericRenderer','mcloud.ui.sidebar.dom','vertical',true);
  await api.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: beforeCollapse.x + beforeCollapse.width / 2, y: beforeCollapse.y + beforeCollapse.height / 2, button: 'left', buttons: 1, clickCount: 1 });
  await api.js("mcloud.ui.sidebar.dom.style.height='0px'");
  await wait(api,'mcloud.ui.sidebar.dom.clientHeight===0 && genericRenderer.scrollbars.measurements.length===0 && !genericRenderer.scrollbars.dragging');
  await api.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: beforeCollapse.x + beforeCollapse.width / 2, y: beforeCollapse.y + beforeCollapse.height / 2, button: 'left', buttons: 0, clickCount: 1 });
  await api.js('mcloud.ui.sidebar.dom.style.removeProperty("height")');
  await wait(api, 'genericRenderer.scrollbars.measurements.some(m => m.controls.element === mcloud.ui.sidebar.dom)');
  assert.ok((await barRect('genericRenderer','mcloud.ui.sidebar.dom','vertical')).height > 0);
  await api.js('genericRenderer.dispose()');
  const disposed = await geometry(); assert.equal(disposed.outer - disposed.client, 10); assert.equal(disposed.opacity, '1'); assert.equal(disposed.controls, 0); assert.equal(disposed.declaration, 'overlay'); assert.equal(disposed.style, native.style, 'Authored inline values/priorities survive takeover');
  await api.js('genericRenderer=new ScrollRenderer(mcloud.ui.sidebar.dom,mcloud.ui.sidebar.shell)'); await delay(250);
  await api.js('genericRenderer.canvas.getContext("webgl").getExtension("WEBGL_lose_context").loseContext()'); await delay(150);
  const lost = await geometry(); assert.equal(lost.outer - lost.client, 10); assert.equal(lost.controls, 0); assert.equal(lost.style, native.style); assert.equal(lost.opacity, '1');
  assert.equal(await api.js(`(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl'?null:get.call(this,kind,...args)};try{new ScrollRenderer(mcloud.ui.sidebar.dom,mcloud.ui.sidebar.shell);return false}catch{return true}finally{HTMLCanvasElement.prototype.getContext=get}})()`), true);
  assert.equal((await geometry()).style, native.style, 'Unavailable WebGL never takes native scrollbar ownership');
  await api.js(`window.headerBlur=document.querySelector('#sidebar-header').getAttribute('data-canvas-blur');document.querySelector('#sidebar-header').setAttribute('data-canvas-blur','[');genericRenderer=new ScrollRenderer(mcloud.ui.sidebar.dom,mcloud.ui.sidebar.shell)`); await delay(200);
  const failed = await geometry(); assert.equal(failed.outer - failed.client, 10); assert.equal(failed.controls, 0); assert.equal(failed.style, native.style); assert.equal(failed.opacity, '1', 'Failed initial paint restores content and native bars');
  await api.js(`document.querySelector('#sidebar-header').setAttribute('data-canvas-blur',headerBlur)`);

  await api.js(`const host=document.createElement('section');Object.assign(host.style,{position:'fixed',left:'500px',top:'30px',width:'320px',height:'320px',zIndex:'1000'});const source=document.createElement('article');Object.assign(source.style,{position:'absolute',inset:'0',overflow:'auto',scrollbarWidth:'thin'});source.setAttribute('data-canvas-scrollbar','overlay');source.innerHTML='<div style="width:800px;height:80px;background:#adf">Horizontal content <button id="normal-action">Normal action</button></div>';host.append(source);document.body.append(host);window.scrollHost=host;window.scrollSource=source;window.genericClicks=[];source.addEventListener('click',()=>genericClicks.push('row'));window.scrollRenderer=new ScrollRenderer(source,host)`); await delay(300);
  const horizontalThumb = await barRect('scrollRenderer','scrollSource','horizontal',true);
  assert.equal(horizontalThumb.height, 6);
  const bars = 'scrollRenderer.scrollbars.paint.get(scrollSource)';
  assert.equal(await api.js(`Boolean(${bars}?.length)`), false, 'Initially hidden');
  const edge = {x:horizontalThumb.x+horizontalThumb.width/2, y:horizontalThumb.y+0.5};
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',...edge});
  await wait(api, `${bars}?.some(layer=>layer.rect.height===4 && layer.rect.y===scrollSource.clientHeight-5)`);
  await delay(1100);
  assert.ok(await api.js(`${bars}?.length`), 'Hover in the unpainted margin keeps the scrollbar visible');
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:edge.x,y:edge.y-12});
  await wait(api, `!${bars}?.length`);

  await drag({...horizontalThumb, y:horizontalThumb.y + 0.5, height:0}, 120, 0);
  assert.ok(await api.js('scrollRenderer.scrollbars.paint.get(scrollSource)?.some(layer => layer.rect.height===4)'));  assert.ok(await api.js('scrollSource.scrollLeft>100 && scrollSource.scrollTop===0')); assert.deepEqual(await api.js('genericClicks'), []);
  await api.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:edge.x,y:edge.y-12});
  await wait(api, `!${bars}?.length`);
  await api.js('scrollSource.scrollLeft=0;barDocumentClicks=0');
  await wait(api, `${bars}?.length`);
  await wait(api, `!${bars}?.length`);
  const ordinary=await api.js('(()=>{const r=document.querySelector("#normal-action").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  for(const type of ['mousePressed','mouseReleased'])await api.call('Input.dispatchMouseEvent',{type,...ordinary,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  assert.equal(await api.js('genericClicks.length'),1,'The next ordinary click is not swallowed');
  await api.js('document.querySelector("#normal-action").focus()');
  for(const type of ['keyDown','keyUp'])await api.call('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})});
  assert.equal(await api.js('genericClicks.length'),2,'Keyboard activation is not swallowed by a previous bar gesture');assert.equal(await api.js('barDocumentClicks'),2);await api.js('genericClicks=[]');
  await api.js("scrollSource.style.direction='rtl';scrollSource.scrollLeft=0"); await delay(150);
  const rtlThumb = await barRect('scrollRenderer','scrollSource','horizontal',true), rtlTrack = await barRect('scrollRenderer','scrollSource','horizontal');
  assert.ok(Math.abs(rtlThumb.x + rtlThumb.width - rtlTrack.x - rtlTrack.width) < .5, 'Native RTL offset zero places the thumb at the right edge');
  await drag(rtlThumb, -100, 0); assert.ok(await api.js('scrollSource.scrollLeft < -100 && scrollSource.scrollTop===0')); assert.deepEqual(await api.js('genericClicks'), []);
  await api.js("scrollSource.style.direction='ltr'");
  await api.js(`scrollSource.innerHTML='<div id="scroll-child" data-canvas-scrollbar="overlay" tabindex="0" style="position:absolute;left:30px;top:40px;width:230px;height:140px;overflow:auto;scrollbar-width:thin;border:1px solid #557"><div style="height:640px;width:380px">'+Array.from({length:16},(_,i)=>'<div style="height:40px;background:'+(i%2?'rgb(210,60,180)':'rgb(10,200,100)')+'">Nested row '+i+'</div>').join('')+'</div>';window.scrollChild=document.getElementById('scroll-child');scrollSource.scrollLeft=0;scrollSource.scrollTop=0`); await delay(300);
  const sample = `(()=>{const gl=scrollRenderer.canvas.getContext('webgl'),p=new Uint8Array(4);gl.readPixels(130,gl.drawingBufferHeight-1-100,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p]})()`;
  const before = await api.js(sample);
  await drag(await barRect('scrollRenderer','scrollChild','vertical',true), 0, 75);
  assert.ok(await api.js('scrollChild.scrollTop>100 && scrollSource.scrollTop===0')); assert.notDeepEqual(await api.js(sample), before, 'Nested scroll changes actual clipped Canvas content, not only an offset counter'); assert.deepEqual(await api.js('genericClicks'), []);
  await api.js('scrollChild.scrollTop=0'); await delay(100);
  await api.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await drag(await barRect('scrollRenderer','scrollChild','vertical',true), 0, 50, true, true); assert.ok(await api.js('scrollChild.scrollTop>0'));
  await api.js('scrollChild.scrollTop=0'); await delay(100);
  await drag(await barRect('scrollRenderer','scrollChild','vertical',true), 0, 50); assert.ok(await api.js('scrollChild.scrollTop>0'), 'Pointer cancellation releases the previous drag'); assert.deepEqual(await api.js('genericClicks'), []);
  await api.js('scrollChild.scrollTop=0;scrollChild.focus()');
  for (const type of ['keyDown', 'keyUp']) await api.call('Input.dispatchKeyEvent', { type, key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 }); await delay(250);
  assert.ok(await api.js('scrollChild.scrollTop>0'), 'Original scroll element retains keyboard scrolling');
  await api.js(`scrollChild.firstElementChild.style.height='30px';scrollChild.firstElementChild.style.width='100px';scrollChild.firstElementChild.innerHTML='Small content'`); await delay(250);
  assert.equal(await api.js('[...scrollRenderer.scrollbars.paint.values()].reduce((n,layers)=>n+layers.length,0)'), 0, 'No phantom input/paint control remains without overflow');
  await api.js('scrollChild.remove()'); await delay(100);
  assert.equal(await api.js('scrollChild.style.getPropertyValue("scrollbar-gutter")'), '', 'Detached nested scroller releases owned overrides'); assert.equal(await api.js('scrollChild.style.scrollbarWidth'), 'thin');
  await api.js('scrollRenderer.dispose()');
  assert.equal(await api.js('scrollHost.children.length'), 1); assert.equal(await api.js('scrollSource.style.scrollbarWidth'), 'thin'); assert.equal(await api.js('scrollSource.style.getPropertyValue("scrollbar-gutter")'), '');
});

test('GPU blur replaces sharp band pixels, excludes background, and preserves crisp foreground', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  const results = await api.js(`(() => {
    const atScale = dpr => {
    const canvas=document.createElement('canvas'), compositor=new Compositor(canvas);compositor.resize(64,64,dpr);
    const pixels=document.createElement('canvas');pixels.width=pixels.height=64;const ctx=pixels.getContext('2d');ctx.fillStyle='white';ctx.fillRect(20,20,8,8);ctx.fillRect(20,45,8,8);
    const foreground=document.createElement('canvas');foreground.width=64;foreground.height=40;const fg=foreground.getContext('2d');fg.fillStyle='red';fg.fillRect(1,1,2,2);
    const texture=compositor.upload(pixels), header=compositor.upload(foreground);
    compositor.render({shape:[{texture,rect:{x:0,y:0,width:64,height:64},opacity:1}],foreground:[{texture:header,rect:{x:0,y:0,width:64,height:40},opacity:1}]},[
      {kind:'source',source:'shape'},
      {kind:'blur',sources:['shape'],rect:{x:0,y:0,width:64,height:40}},
      {kind:'source',source:'foreground'},
    ]);
    const gl=compositor.gl, size=64*dpr;
    const sample=(x,y)=>{const data=new Uint8Array(4);gl.readPixels(Math.floor((x+.5)*dpr),size-1-Math.floor((y+.5)*dpr),1,1,gl.RGBA,gl.UNSIGNED_BYTE,data);return [...data]};
    const result={spread:sample(18,24),replaced:sample(24,24),sharp:sample(24,49),background:sample(60,60),foreground:sample(1,1)};
    const background=document.createElement('canvas');background.width=background.height=64;const bg=background.getContext('2d');bg.fillStyle='blue';bg.fillRect(0,0,64,64);const bgTexture=compositor.upload(background);
    const green=document.createElement('canvas');green.width=green.height=64;const gx=green.getContext('2d');gx.fillStyle='lime';gx.fillRect(46,20,8,8);const greenTexture=compositor.upload(green);
    compositor.render({bg:[{texture:bgTexture,rect:{x:0,y:0,width:64,height:64},opacity:1}]},[{kind:'source',source:'bg'}]);result.baseline=sample(60,24);
    compositor.render({bg:[{texture:bgTexture,rect:{x:0,y:0,width:64,height:64},opacity:1}],shape:[{texture,rect:{x:0,y:0,width:64,height:64},opacity:1}],green:[{texture:greenTexture,rect:{x:0,y:0,width:64,height:64},opacity:1}]},[{kind:'source',source:'bg'},{kind:'group',opacity:.5,layers:[{kind:'source',source:'shape'}]},{kind:'source',source:'green'},{kind:'blur',sources:['shape'],rect:{x:0,y:0,width:64,height:40}}]);
    result.page={background:sample(60,24),outside:sample(60,60),unselected:sample(49,24),opacity:sample(24,24),blending:compositor.gl.isEnabled(compositor.gl.BLEND),error:compositor.gl.getError()};
    compositor.remove(bgTexture);compositor.remove(greenTexture);compositor.remove(texture);compositor.remove(header);compositor.dispose();return result;
    };
    return [atScale(1),atScale(2)];
  })()`);
  t.diagnostic(JSON.stringify(results));
  for (const result of results) {
    assert.ok(result.spread[3] > 0, 'Blur spreads beyond the original white shape');
    assert.ok(result.replaced[3] < 240, 'The sharp opaque source is replaced, not retained beneath blur');
    assert.equal(result.sharp[3], 255, 'Pixels outside the visible header band stay sharp');
    assert.deepEqual(result.background, [0, 0, 0, 0], 'No sidebar background enters the list blur input');
    assert.deepEqual(result.foreground, [255, 0, 0, 255], 'Header foreground stays crisp');
    assert.deepEqual(result.page.background,[0,0,255,255],'Replacing selected content retains the page background in the blur band');
    assert.deepEqual(result.page.unselected,[0,255,0,255],'Unselected later layers keep their paint position');
    assert.ok(Math.abs(result.page.opacity[0]-result.replaced[3]/2)<3,'Opacity applies once to the selected scope');
  }
  assert.ok(Math.abs(results[0].replaced[3] - results[1].replaced[3]) < 12, 'Blur radius stays in CSS pixels across device pixel ratios');
});

test('GPU preserves aligned raster texels at integer and fractional DPR', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  const results = await api.js(`(() => {
    const Compositor=window.Compositor;
    return [1,1.25,1.1,2].map(dpr=>{
      const output=document.createElement('canvas'), compositor=new Compositor(output);compositor.resize(169.75,70,dpr);
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
      const result={dpr,backing:[output.width,output.height],aligned:difference(0,input.width/dpr,input.height/dpr),squeezed:difference(0,121,31),shifted:difference(.5/dpr,input.width/dpr,input.height/dpr)};
      compositor.remove(texture);compositor.dispose();return result;
    });
  })()`);
  for (const result of results) {
    assert.deepEqual(result.backing,[Math.ceil(169.75*result.dpr),Math.ceil(70*result.dpr)],'Backing dimensions are rounded from native input once');
    assert.equal(result.aligned, 0, `Allocated raster extents preserve every alpha texel at DPR ${result.dpr}`);
    assert.ok(result.shifted > 0, 'A half-device-pixel placement reproduces interpolation loss');
  }
  assert.ok(results.find(result => result.dpr === 1.25).squeezed > 0, 'Squeezing ceil padding into logical dimensions reproduces fractional-DPR interpolation');
});

test('fractional layout text retains sharp rasters, transformed geometry and cache reuse', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await api.js(`window.SharpRenderer=GenericRenderer;
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
      return {dpr:resource.dpr,sizes:[...renderer.resources].slice(0,2).map(([element,r])=>({boxSizing:getComputedStyle(element).boxSizing,layout:[r.snapshot.layoutWidth,r.snapshot.layoutHeight],actual:[element.getBoundingClientRect().width,element.getBoundingClientRect().height]})),raster:[resource.canvas.width,resource.canvas.height],placement:placement.rect,actual:[rect.width,rect.height],actualOrigin:[rect.x-sharpSource.getBoundingClientRect().x,rect.y-sharpSource.getBoundingClientRect().y],maxAlphaError,ink,shadow:{extent:[shadowRect.width,shadowRect.height],pixels:[shadow.pixelWidth,shadow.pixelHeight],offset:[shadow.snapshot.offsetX,shadow.snapshot.offsetY]}};
    })()`);
    assert.equal(state.dpr, dpr, 'A cached raster always uses the current DPR');
    assert.deepEqual(state.sizes.map(size => size.boxSizing), ['content-box', 'border-box']);
    for (const size of state.sizes) {
      assert.deepEqual(size.layout, [274, 43.1875], 'Snapshot dimensions preserve fractional border-box layout');
      assert.deepEqual(size.actual, size.layout, 'Ordinary layout introduces no artificial scale');
    }
    const extent = (start, size) => Math.ceil((start + size) * dpr) - Math.floor(start * dpr);
    assert.deepEqual(state.raster, [extent(state.actualOrigin[0], 274), extent(state.actualOrigin[1], 43.1875)]);
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
    const transformed = await api.js(`(()=>{const r=sharpRenderer,row=sharpSource.children[1],resource=r.resources.get(row),p=sharpSources[r.tree.byElement.get(row).id][0].rect,b=row.getBoundingClientRect(),origin=sharpSource.getBoundingClientRect();return {sameCanvas:resource.canvas===sharpCachedCanvas,rasterizations:r.stats.rasterizations,scale:[p.width/(resource.canvas.width/devicePixelRatio),p.height/(resource.canvas.height/devicePixelRatio)],origin:[p.x,p.y],actualOrigin:[b.x-origin.x,b.y-origin.y],padding:[-resource.snapshot.offsetX,-resource.snapshot.offsetY]}})()`);
    assert.equal(transformed.sameCanvas, true); assert.equal(transformed.rasterizations, before.rasterizations);
    for (const scale of transformed.scale) assert.ok(Math.abs(scale - .97) < 1e-5, 'Intentional CSS scale changes output geometry');
    for (let i = 0; i < 2; i++) assert.ok(Math.abs(transformed.origin[i] + transformed.padding[i]*transformed.scale[i] - transformed.actualOrigin[i]) < 1e-5, 'The border box inside the padded bitmap retains its native fractional placement');
    await api.js('sharpSource.children[1].style.transform="";sharpHost.style.transform=""'); await delay(100);
    assert.equal(await api.js('sharpRenderer.stats.rasterizations'), before.rasterizations, 'Releasing a scale transform reuses the text raster');
    const idle = await api.js('({...sharpRenderer.stats})'); await delay(150);
    assert.deepEqual(await api.js('({...sharpRenderer.stats})'), idle, 'Fractional size comparisons do not cause idle rerasterization');
  }
  await api.js('sharpRenderer.dispose();sharpHost.remove()');
});
test('positioned paint scopes keep in-flow children above their parent background without trapping real z contexts', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.js(`(()=>{
    const host=document.createElement('section'),source=document.createElement('article');host.style.cssText='position:fixed;left:400px;top:50px;width:300px;height:260px;z-index:1000';source.style.cssText='position:absolute;inset:0';
    source.innerHTML='<section style="position:relative;width:280px;height:220px;background:blue"><div style="position:absolute;z-index:-1;inset:0;background:red"></div><div style="width:240px;height:160px;background:#00cc00"><div style="position:absolute;left:20px;top:60px;width:80px;height:40px;background:yellow"></div></div><div style="position:absolute;z-index:2;left:170px;top:80px;width:40px;height:40px;background:magenta"></div></section><div style="position:absolute;z-index:0;left:140px;top:50px;width:100px;height:100px;background:cyan"></div>';
    host.appendChild(source);document.body.appendChild(host);window.scopeRenderer=new GenericRenderer(source,host);
  })()`); await delay(250);
  const colors = await api.js(`(()=>{const r=scopeRenderer.source.getBoundingClientRect();return [[30,30],[265,30],[30,80],[150,70],[180,90]].map(([x,y])=>scenePixel(scopeRenderer,r.left+x,r.top+y))})()`);
  assert.deepEqual(colors,[[0,204,0,255],[0,0,255,255],[255,255,0,255],[0,255,255,255],[255,0,255,255]],'In-flow fill, covered negative context, positioned descendant, zero sibling, and positive escaped context retain CSS order');
  await api.js('scopeRenderer.dispose();scopeRenderer.shell.remove()');
});

async function nativeCanvasDifference(api, renderer, element, width) {
  const rect = await api.js(`(()=>{const r=(${element}).getBoundingClientRect();return {x:r.left,y:r.top,width:Math.min(r.width,${width || 10000}),height:r.height,scale:1}})()`);
  const canvas = await api.call('Page.captureScreenshot', { format: 'png', clip: rect });
  await api.js(`(${renderer}).canvas.style.visibility='hidden';(${renderer}).source.removeAttribute('data-canvas-rendered')`);
  const native = await api.call('Page.captureScreenshot', { format: 'png', clip: rect });
  await api.js(`(${renderer}).canvas.style.visibility='';(${renderer}).source.setAttribute('data-canvas-rendered','')`);
  return api.js(`(async()=>{const decode=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return x.getImageData(0,0,c.width,c.height).data};const a=await decode('${canvas.data}'),b=await decode('${native.data}');let error=0,changed=0;for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++)error+=Math.abs(a[i+c]-b[i+c]);if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>60)changed++}return {mean:error/(a.length/4*3),changed,pixels:a.length/4}})()`);
}

test('rounded ancestor clips preserve split resources, opacity, shadows and bounded masks at fractional DPR', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1.25, mobile: false });
  await api.js(`(()=>{
    const host=document.createElement('section'),source=document.createElement('article');
    host.style.cssText='position:fixed;left:400px;top:100px;width:280px;height:180px;background:white;z-index:1000';
    source.style.cssText='position:absolute;inset:0';
    source.innerHTML='<div style="position:relative;margin:16px;width:220px;height:24px;border:3px solid blue;border-radius:15px;overflow:hidden;opacity:.6"><div style="position:relative;z-index:2;height:100%;background:red;box-shadow:0 0 3px red"></div><canvas style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas></div>';
    host.append(source);document.body.append(host);window.clipSource=source;window.clipOuter=source.firstElementChild;window.clipFill=clipOuter.firstElementChild;window.clipRenderer=new GenericRenderer(source,host);
  })()`);
  await wait(api, 'clipSource.hasAttribute("data-canvas-rendered")');
  for (const width of ['1px', '96px', '220px']) {
    await api.js(`clipFill.style.width='${width}'`); await delay(120);
    assert.equal(await api.js('getComputedStyle(clipFill).borderTopLeftRadius'), '0px');
    assert.ok(await api.js('clipRenderer.resources.has(clipFill) && clipRenderer.resources.has(clipOuter)'), 'Foreground and clip ancestor are independent paint resources');
    const difference = await nativeCanvasDifference(api, 'clipRenderer', 'clipOuter');
    t.diagnostic(`Generic rounded ${width}: ${JSON.stringify(difference)}`);
    assert.ok(difference.mean < 6, 'Cross-resource clip, border and group opacity match native rounded overflow: '+JSON.stringify(difference));
  }
  await api.js(`window.clipStyle=document.createElement('style');clipStyle.textContent='#clip-parent:has(.flag){background:rgb(0,200,0)}';document.head.append(clipStyle);clipOuter.id='clip-parent';clipFill.style.width='96px';clipFill.classList.add('flag')`); await delay(150);
  assert.ok(await api.js('(()=>{const r=clipOuter.getBoundingClientRect(),p=scenePixel(clipRenderer,r.left+180,r.top+15);return p[1]>p[0]+60})()'), 'An own-only ancestor background changed by :has is dirtied along with the descendant resource');
  await api.js(`clipStyle.remove();clipFill.classList.remove('flag');window.clipUploads=[];const upload=clipRenderer.compositor.upload;clipRenderer.compositor.upload=function(c){clipUploads.push([c.width,c.height]);return upload.call(this,c)};clipOuter.style.cssText='position:relative;margin:16px;width:220px;height:100000px;border-radius:15px;overflow:hidden';clipFill.style.height='24px';clipOuter.lastElementChild.style.height='1px'`); await delay(150);
  assert.ok(await api.js('clipUploads.length>0 && clipUploads.every(([w,h])=>w<=clipRenderer.canvas.width&&h<=clipRenderer.canvas.height)'), 'A 100,000px rounded ancestor allocates only visible clip/resource surfaces');
  assert.deepEqual(await api.js('(()=>{const r=clipOuter.getBoundingClientRect();return scenePixel(clipRenderer,r.left+40,r.top+12).slice(0,3)})()'), [255,0,0], 'Bounded mask allocation retains actual clipped foreground');
  await api.js(`clipRenderer.shell.style.height='90px';clipOuter.style.cssText='position:relative;width:240px;height:100000px;border-radius:120px;overflow:hidden';clipFill.style.cssText='position:absolute;z-index:2;left:0;top:85px;width:240px;height:50px;background:red';clipOuter.lastElementChild.style.cssText='position:absolute;left:0;top:0;width:1px;height:1px'`);await delay(200);
  assert.deepEqual(await api.js('(()=>{const r=clipSource.getBoundingClientRect();return scenePixel(clipRenderer,r.left+120,r.top+87)})()'),[255,0,0,255]);
  await api.js("clipRenderer.shell.style.height='180px'");await delay(200);
  assert.deepEqual(await api.js('(()=>{const r=clipSource.getBoundingClientRect();return scenePixel(clipRenderer,r.left+120,r.top+110)})()'),[255,0,0,255],'Growing the source viewport refreshes the effective mask extent, exposing the newly visible resource');
  await api.js('clipRenderer.dispose();clipRenderer.shell.remove()');
});

test('local content and boundary changes retain distant native-flow selection, nested scrolling and real cached pixels', { skip: !supported, timeout: 60000 }, async t => {
  const { api } = await browser(t);
  await api.js(`(()=>{
    const host=document.createElement('section'),source=document.createElement('article');
    host.style.cssText='position:fixed;left:420px;top:40px;width:320px;height:260px;background:white;z-index:1000';
    source.style.cssText='position:absolute;inset:0;overflow:auto;scrollbar-width:none';
    source.innerHTML='<div>'+Array.from({length:2400},(_,i)=>'<section style="position:relative;contain:paint;height:'+(32+i%5*3)+'px;background:'+(i%2?'rgb(0,120,220)':'rgb(220,50,0)')+'"><span>Native row '+i+'</span></section>').join('')+'</div>';
    host.append(source);document.body.append(host);window.flowSource=source;window.flowContent=source.firstElementChild;window.flowRows=[...flowContent.children];window.flowRenderer=new GenericRenderer(source,host);
    window.flowSample=()=>{const row=flowRows.find(e=>{const r=e.getBoundingClientRect(),v=flowSource.getBoundingClientRect();return r.top>=v.top&&r.bottom<=v.bottom});const r=row.getBoundingClientRect();return {index:flowRows.indexOf(row),color:scenePixel(flowRenderer,r.right-5,r.top+8),ink:sceneInk(flowRenderer,row).ink,stats:{...flowRenderer.stats},observed:flowRenderer.sizeTargets.size}};
  })()`);
  await wait(api, 'flowSource.hasAttribute("data-canvas-rendered")'); await delay(150);
  // The application's real mousedown/keydown handlers repeatedly remove/add
  // body.keyboard-input. A no-op class mutation must not rebuild either tree.
  await api.js('document.body.classList.remove("keyboard-input")'); await delay(100);
  const beforeNoOp = await api.js('({flow:{...flowRenderer.stats}})');
  const noOp = await api.js(`(()=>{let reads=0;const get=window.getComputedStyle;window.getComputedStyle=(...args)=>{reads++;return get(...args)};document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));return new Promise(resolve=>setTimeout(()=>{window.getComputedStyle=get;resolve({reads,flow:{...flowRenderer.stats}})},100))})()`);
  assert.ok(noOp.reads < 100, 'Repeated native body-input mode assignment does not walk either list: '+noOp.reads);
  assert.deepEqual({flow:noOp.flow},beforeNoOp,'No-op native input-mode notifications do not schedule either renderer');
  const initial = await api.js('flowSample()');
  assert.ok(initial.ink > 100); assert.ok(initial.observed < 30, 'Native resize observation is viewport-bounded');
  // Mutating a resource far from the viewport changes its layout in the real
  // DOM now; subsequent large and reverse jumps must find current geometry.
  const locality = await api.js(`(()=>{let reads=0;const get=window.getComputedStyle;window.getComputedStyle=(...args)=>{reads++;return get(...args)};flowRows[1900].querySelector('span').textContent='Changed distant content';flowRows[1900].style.height='84px';return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{window.getComputedStyle=get;resolve(reads)})))})()`);
  assert.ok(locality < 300, 'A local update does not read all 2400 row styles: '+locality);
  const geometryReads = await api.js(`(()=>{let reads=0;const get=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){reads++;return get.call(this)};flowSource.scrollTop=flowRows[1900].offsetTop;return new Promise(resolve=>setTimeout(()=>{Element.prototype.getBoundingClientRect=get;resolve(reads)},150))})()`);
  assert.ok(geometryReads < 400, 'Far scroll reads nearby boxes and logarithmic native probes, not all rows: '+geometryReads);
  for (const index of [1900, 80, 2300, 0]) {
    await api.js(`flowSource.scrollTop=flowRows[${index}].offsetTop`); await delay(150);
    const sample = await api.js('flowSample()');
    t.diagnostic('Native flow jump: '+JSON.stringify(sample));
    assert.equal(sample.index, index); assert.ok(sample.ink > 100); assert.ok(sample.observed < 35); assert.ok(sample.stats.cachedResources < 25);
    assert.deepEqual(sample.color.slice(0,3),index%2?[0,120,220]:[220,50,0], 'Visible cache holds the row currently at this real native scroll offset');
  }
  await api.js(`window.insertedFlow=flowRows[1].cloneNode(true);insertedFlow.style.background='rgb(10,20,30)';flowContent.insertBefore(insertedFlow,flowRows[1]);flowSource.scrollTop=insertedFlow.offsetTop`); await delay(150);
  assert.deepEqual(await api.js('(()=>{const r=insertedFlow.getBoundingClientRect();return scenePixel(flowRenderer,r.right-5,r.top+8).slice(0,3)})()'),[10,20,30],'Inserting a flow sibling updates membership and native selection');
  await api.js('insertedFlow.remove();flowSource.scrollTop=0'); await delay(150);
  await api.js(`(()=>{const row=flowRows[0];row.innerHTML='<div style="position:absolute;left:0;top:0;width:100px;height:30px;background:yellow;z-index:0"></div>';window.flowOverlay=row.firstElementChild;})()`); await delay(100);
  assert.equal(await api.js('flowRenderer.resources.has(flowOverlay)'),false,'A zero-level descendant remains in the ordinary atomic row');
  await api.js("flowOverlay.style.zIndex='3'"); await delay(150);
  assert.equal(await api.js('flowRenderer.resources.has(flowOverlay)'),true,'A new nonzero stacking context changes the local resource boundary');
  assert.deepEqual(await api.js('(()=>{const r=flowRows[0].getBoundingClientRect();return scenePixel(flowRenderer,r.left+10,r.top+10).slice(0,3)})()'),[255,255,0]);
  await api.js(`flowOverlay.remove();flowRows[0].textContent='Restored row';flowRows[0].style.background='rgb(0,180,0)'`); await delay(150);
  assert.deepEqual(await api.js('flowSample().color.slice(0,3)'),[0,180,0],'Removing a split descendant restores the enclosing cached content');
  await api.js(`(()=>{const row=flowRows[0];row.style.height='180px';row.innerHTML='<div style="height:140px;overflow:auto;border-radius:12px"><div>'+Array.from({length:160},(_,i)=>'<section style="position:relative;contain:paint;height:30px;background:'+(i%2?'red':'lime')+'">Nested '+i+'</section>').join('')+'</div></div>';window.flowNested=row.firstElementChild;flowNested.scrollTop=3010})()`); await delay(200);
  const nested = await api.js('(()=>{const r=flowNested.getBoundingClientRect();return {top:flowNested.scrollTop,pixel:scenePixel(flowRenderer,r.left+200,r.top+15),resources:flowRenderer.stats.cachedResources}})()');
  assert.equal(nested.top,3010); assert.deepEqual(nested.pixel.slice(0,3),[0,255,0]); assert.ok(nested.resources<30,JSON.stringify(nested));
  const idle = await api.js('({...flowRenderer.stats})'); await delay(200);
  assert.deepEqual(await api.js('({...flowRenderer.stats})'),idle,'Nested clipping and local invalidation leave no idle loop');
  await api.js('flowRenderer.dispose();flowRenderer.shell.remove()');
});

test('GPU source blur and drop-shadow work without Canvas2D filters, and backdrop reads prior layers', {skip:!supported,timeout:60000},async t=>{
  const {api}=await browser(t);
  const result=await api.js(`(()=>{const canvas=document.createElement('canvas'),compositor=new Compositor(canvas);compositor.resize(64,64,1.25);const input=document.createElement('canvas');input.width=input.height=80;const x=input.getContext('2d');x.scale(1.25,1.25);x.fillStyle='white';x.fillRect(20,20,8,8);const blurred=compositor.upload(input,'blur(4px)'),shadow=compositor.upload(input,'drop-shadow(rgba(255, 0, 0, 0.5) 4px 0px 1px)');const sample=(x,y)=>{const p=new Uint8Array(4),gl=compositor.gl;gl.readPixels(Math.floor(x*1.25),79-Math.floor(y*1.25),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p]};compositor.render({a:[{texture:blurred,rect:{x:0,y:0,width:64,height:64},opacity:1,flip:true}]},[{kind:'source',source:'a'}]);const blur={outside:sample(18,24),inside:sample(24,24)};compositor.render({a:[{texture:shadow,rect:{x:0,y:0,width:64,height:64},opacity:1,flip:true}]},[{kind:'source',source:'a'}]);const drop={shadow:sample(30,24),source:sample(24,24)};x.fillStyle='red';x.fillRect(0,0,64,64);x.fillStyle='blue';for(let i=0;i<64;i+=8)x.fillRect(i,0,4,64);const stripes=compositor.upload(input);const sources={a:[{texture:stripes,rect:{x:0,y:0,width:64,height:64},opacity:1}]};const variation=()=>{let sum=0,previous=sample(16,30);for(let i=17;i<48;i++){const next=sample(i,30);sum+=Math.abs(next[0]-previous[0])+Math.abs(next[2]-previous[2]);previous=next}return sum};compositor.render(sources,[{kind:'source',source:'a'}]);const sharp=variation(),outside=sample(4,30);compositor.render(sources,[{kind:'source',source:'a'},{kind:'backdrop',rect:{x:12,y:12,width:40,height:40},clip:{x:12,y:12,width:40,height:40},roundedClips:[{rect:{x:12,y:12,width:40,height:40},radii:Array(4).fill({x:8,y:8})}],radius:5,saturation:1}]);const backdrop={sharp,blurred:variation(),outside:sample(4,30),alpha:sample(30,30)[3]};compositor.remove(blurred);compositor.remove(shadow);compositor.remove(stripes);compositor.dispose();return {blur,drop,backdrop,originalOutside:outside}})()`);
  t.diagnostic(JSON.stringify(result));assert.ok(result.blur.outside[3]>0&&result.blur.inside[3]<240);assert.ok(result.drop.shadow[0]>20&&result.drop.shadow[1]===0&&result.drop.shadow[3]>20);assert.deepEqual(result.drop.source,[255,255,255,255]);assert.ok(result.backdrop.blurred<result.backdrop.sharp*.3);assert.deepEqual(result.backdrop.outside,result.originalOutside);assert.equal(result.backdrop.alpha,255);
});

test('large GPU blur prefilters high-frequency input instead of sampling repeated sparse stripes', {skip:!supported,timeout:60000},async t=>{
 const {api}=await browser(t);
 const result=await api.js(`(()=>{
   const dpr=2,canvas=document.createElement('canvas'),compositor=new Compositor(canvas);compositor.resize(400,400,dpr);
   const input=document.createElement('canvas');input.width=input.height=800;const ctx=input.getContext('2d');ctx.scale(dpr,dpr);
   ctx.fillStyle='white';ctx.fillRect(90,90,220,220);ctx.fillStyle='black';
   for(let p=90;p<310;p+=7.5){ctx.fillRect(p,90,3.75,220);ctx.fillRect(90,p,220,3.75)}
   const texture=compositor.upload(input,'blur(30px)');compositor.render({a:[{texture,flip:true,rect:{x:0,y:0,width:400,height:400},opacity:1}]},[{kind:'source',source:'a'}]);
   const gl=compositor.gl,pixels=new Uint8Array(800*800*4);gl.readPixels(0,0,800,800,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   const raw=ctx.getImageData(0,0,800,800).data;let sum=0,norm=0,adjacent=0,count=0;
   for(let y=-180;y<=180;y++)for(let x=-180;x<=180;x++){const weight=Math.exp(-(x*x+y*y)/(2*60*60));sum+=raw[((400+y)*800+400+x)*4]*weight;norm+=weight}
   for(let y=320;y<480;y++)for(let x=320;x<480;x++){const a=((799-y)*800+x)*4;adjacent+=Math.abs(pixels[a]-pixels[a+4]);count++}
   const center=pixels[((799-400)*800+400)*4];compositor.remove(texture);compositor.dispose();return {gaussian:sum/norm,center,adjacent:adjacent/count};
 })()`);
 t.diagnostic(JSON.stringify(result));assert.ok(Math.abs(result.center-result.gaussian)<4,JSON.stringify(result));assert.ok(result.adjacent<2,'Large blur has no repeated high-frequency grid: '+JSON.stringify(result));
});
