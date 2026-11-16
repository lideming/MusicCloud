import { PaintClip, PaintRect } from "./CanvasPaint";

export interface PaintPlacement { texture: WebGLTexture; rect: PaintRect; opacity: number; clip?: PaintRect; selectionOpacity?: number; roundedClips?: PaintClip[] }
export interface PaintSolid { rect: PaintRect; color: number[] }
export type CanvasLayer =
  | { kind: "source"; source: string }
  | { kind: "group"; opacity: number; layers: CanvasLayer[] }
  | { kind: "blur"; sources: string[]; rect: PaintRect }
  | ({ kind: "solid" } & PaintSolid);
interface Target { texture: WebGLTexture; buffer: WebGLFramebuffer }
const vertex = `
attribute vec2 a_position;
uniform vec2 u_size;
uniform vec4 u_rect;
varying vec2 v_uv;
varying vec2 v_position;
void main() {
  v_uv = a_position;
  vec2 p = u_rect.xy + a_position * u_rect.zw;
  v_position = p;
  gl_Position = vec4(p.x / u_size.x * 2.0 - 1.0, 1.0 - p.y / u_size.y * 2.0, 0, 1);
}`;
// Every texture uses top-left UVs (framebuffer textures are flipped explicitly).
const fragment = `
precision highp float;
varying vec2 v_uv;
varying vec2 v_position;
uniform sampler2D u_mask;
uniform vec4 u_maskRect;
uniform float u_masked;
uniform sampler2D u_image;
uniform vec2 u_step;
uniform float u_flip;
uniform float u_opacity;
uniform vec4 u_tint;
void main() {
  vec2 uv = vec2(v_uv.x, mix(v_uv.y, 1.0 - v_uv.y, u_flip));
  vec4 c = texture2D(u_image, uv);
  if (u_step.x != 0.0 || u_step.y != 0.0) {
  c = vec4(0.0);
  float total = 0.0;
  for (int i = -12; i <= 12; i++) {
    float weight = exp(-float(i * i) / 32.0);
    c += texture2D(u_image, uv + u_step * float(i)) * weight;
    total += weight;
  }
  c /= total;
  }
  float coverage = 1.0;
  if (u_masked > 0.5) {
    vec2 maskUV = (v_position - u_maskRect.xy) / u_maskRect.zw;
    coverage = texture2D(u_mask, maskUV).a;
    if (maskUV.x < 0.0 || maskUV.y < 0.0 || maskUV.x > 1.0 || maskUV.y > 1.0) coverage = 0.0;
  }
  gl_FragColor = (c * (1.0 - u_tint.a) + vec4(u_tint.rgb * u_tint.a, u_tint.a)) * u_opacity * coverage;
}`;

/** Ordered, content-only composition. Effects select their input sources
 * explicitly and replace pixels only in their own region. Host backgrounds
 * and native backdrop materials never enter these transparent targets. */
export class CanvasCompositor {
  readonly gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private vertices: WebGLBuffer;
  private targets: Target[] = [];
  private groups: Target[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private masks = new Map<string, { texture: WebGLTexture; width: number; height: number }>();
  private locations: { [name: string]: WebGLUniformLocation | null } = {};
  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind)!;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Canvas shader compile failed");
      return shader;
    };
    this.program = gl.createProgram()!;
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) || "Canvas shader link failed");
    gl.useProgram(this.program);
    this.vertices = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const name of ["size", "rect", "step", "flip", "opacity", "tint", "image", "mask", "maskRect", "masked"]) this.locations[name] = gl.getUniformLocation(this.program, "u_" + name);
    gl.uniform1i(this.locations.image, 0); gl.uniform1i(this.locations.mask, 1);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }
  upload(canvas: HTMLCanvasElement) {
    const texture = this.makeTexture();
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
    return texture;
  }
  remove(texture: WebGLTexture) { this.gl.deleteTexture(texture); }
  private makeTexture() {
    const gl = this.gl, texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }
  resize(width: number, height: number, dpr: number) {
    // Round native input once, then use that backing's CSS extent throughout
    // projection/composition. Fractional padding must not scale every texel.
    const pixelWidth = Math.max(1, Math.ceil(width * dpr)), pixelHeight = Math.max(1, Math.ceil(height * dpr));
    width = pixelWidth / dpr; height = pixelHeight / dpr;
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    const gl = this.gl;
    this.width = width; this.height = height; this.dpr = dpr;
    this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
    [...this.targets, ...this.groups].forEach(t => { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.buffer); });
    this.groups = [];
    this.targets = Array.from({ length: 4 }, () => this.createTarget());
  }
  private createTarget(): Target {
    const gl = this.gl, texture = this.makeTexture(), buffer = gl.createFramebuffer()!;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Canvas framebuffer incomplete");
    return { texture, buffer };
  }
  private target(target: Target | null, clear = true) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.buffer ?? null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    if (clear) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  }
  private draw(texture: WebGLTexture, rect: PaintRect, opacity = 1, flip = false, step = [0, 0], tint = [0, 0, 0, 0], mask?: { texture: WebGLTexture; rect: PaintRect }) {
    const gl = this.gl, u = this.locations;
    gl.uniform1f(u.masked, mask ? 1 : 0);
    if (mask) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mask.texture);
      gl.uniform4f(u.maskRect, mask.rect.x, mask.rect.y, mask.rect.width, mask.rect.height);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform2f(u.size, this.width, this.height);
    gl.uniform4f(u.rect, rect.x, rect.y, rect.width, rect.height);
    gl.uniform2f(u.step, step[0], step[1]); gl.uniform1f(u.flip, flip ? 1 : 0);
    gl.uniform1f(u.opacity, opacity); gl.uniform4fv(u.tint, tint);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  private clip(rect: PaintRect, padding = 0) {
    const gl = this.gl;
    const left = Math.max(0, rect.x), right = Math.min(this.width, rect.x + rect.width);
    const top = Math.max(0, rect.y - padding), bottom = Math.min(this.height, rect.y + rect.height + padding);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.floor(left * this.dpr), Math.floor((this.height - bottom) * this.dpr), Math.max(0, Math.ceil((right - left) * this.dpr)), Math.max(0, Math.ceil((bottom - top) * this.dpr)));
  }
  private mask(clips: PaintClip[], used: Set<string>, clip: PaintRect) {
    const left = Math.max(0, clip.x, ...clips.map(c => c.rect.x)), top = Math.max(0, clip.y, ...clips.map(c => c.rect.y));
    const right = Math.min(this.width, clip.x + clip.width, ...clips.map(c => c.rect.x + c.rect.width)), bottom = Math.min(this.height, clip.y + clip.height, ...clips.map(c => c.rect.y + c.rect.height));
    const shapes = clips.map(c => ({ rect: { ...c.rect, x: c.rect.x - left, y: c.rect.y - top }, radii: c.radii }));
    // Translation-independent: scrolling and placement-only movement reuse the
    // same mask texels. Restrict allocation to the output viewport as well.
    const key = JSON.stringify([this.dpr, shapes]);
    used.add(key);
    let cached = this.masks.get(key);
    if (!cached) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(Math.max(0, right - left) * this.dpr));
      canvas.height = Math.max(1, Math.ceil(Math.max(0, bottom - top) * this.dpr));
      const ctx = canvas.getContext("2d")!; ctx.scale(this.dpr, this.dpr);
      for (const shape of shapes) { const r = shape.rect; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.width, r.height, shape.radii); ctx.clip(); }
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, Math.max(0, right - left), Math.max(0, bottom - top));
      cached = { texture: this.upload(canvas), width: canvas.width / this.dpr, height: canvas.height / this.dpr };
      this.masks.set(key, cached);
    }
    return { texture: cached.texture, rect: { x: left, y: top, width: cached.width, height: cached.height } };
  }
  render(sources: { [id: string]: PaintPlacement[] }, layers: CanvasLayer[], opacity = 1) {
    const [selected, horizontal, blurred, composed] = this.targets;
    const usedMasks = new Set<string>();
    const full = { x: 0, y: 0, width: this.width, height: this.height };
    const drawSource = (id: string, selection = false) => {
      sources[id].forEach(p => {
        if (p.clip) this.clip(p.clip); else this.gl.disable(this.gl.SCISSOR_TEST);
        // A source wholly within either straight interior band cannot meet a
        // rounded corner. Long clipped ancestors need no scrolling mask there.
        const rounded = p.roundedClips?.filter(c => {
          const r = c.rect, a = c.radii, b = p.rect;
          return !(b.y >= r.y + Math.max(a[0].y, a[1].y) && b.y + b.height <= r.y + r.height - Math.max(a[2].y, a[3].y) ||
            b.x >= r.x + Math.max(a[0].x, a[3].x) && b.x + b.width <= r.x + r.width - Math.max(a[1].x, a[2].x));
        });
        const mask = rounded?.length ? this.mask(rounded, usedMasks, p.clip ?? full) : undefined;
        this.draw(p.texture, p.rect, selection ? p.selectionOpacity ?? p.opacity : p.opacity, false, [0, 0], [0, 0, 0, 0], mask);
      });
      this.gl.disable(this.gl.SCISSOR_TEST);
    };
    const compose = (layers: CanvasLayer[], output: Target, depth = 0) => {
      this.target(output);
      for (const layer of layers) {
        if (layer.kind === "source") {
          drawSource(layer.source);
        } else if (layer.kind === "group") {
          const group = this.groups[depth] ?? (this.groups[depth] = this.createTarget());
          compose(layer.layers, group, depth + 1);
          this.target(output, false); this.draw(group.texture, full, layer.opacity, true);
        } else if (layer.kind === "solid") {
          // Opaque tint replaces the sampled color; opacity comes from the solid.
          this.draw(selected.texture, layer.rect, layer.color[3], true, [0, 0], [...layer.color.slice(0, 3), 1]);
        } else {
          this.target(selected);
          layer.sources.forEach(id => drawSource(id, true));
          // Kernel offsets and its sampling margin are CSS pixels, like region
          // geometry; higher DPR only increases the render-target resolution.
          this.target(horizontal); this.clip(layer.rect, 12);
          this.draw(selected.texture, full, 1, true, [1 / this.width, 0]);
          this.target(blurred); this.clip(layer.rect);
          this.draw(horizontal.texture, full, 1, true, [0, 1 / this.height]);
          this.target(output, false);
          const gl = this.gl;
          this.clip(layer.rect);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          this.draw(blurred.texture, full, 1, true);
          gl.disable(gl.SCISSOR_TEST);
        }
      }
    };
    compose(layers, composed);
    this.target(null); this.draw(composed.texture, full, opacity, true);
    for (const [key, mask] of this.masks) if (!usedMasks.has(key)) { this.remove(mask.texture); this.masks.delete(key); }
    if (this.gl.isContextLost()) throw new Error("Canvas WebGL context lost");
  }
  dispose() {
    const gl = this.gl;
    [...this.targets, ...this.groups].forEach(t => { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.buffer); });
    this.masks.forEach(mask => this.remove(mask.texture)); this.masks.clear();
    gl.deleteBuffer(this.vertices); gl.deleteProgram(this.program);
  }
}
