import { PaintClip, PaintRect, readBoxShadow } from "./CanvasPaint";

export interface PaintQuad { x: number; y: number; ax: number; ay: number; bx: number; by: number }
export interface PaintPlacement { texture: WebGLTexture; rect: PaintRect; opacity: number; clip?: PaintRect; selectionOpacity?: number; flip?: boolean; quad?: PaintQuad; roundedClips?: PaintClip[] }
export interface PaintSolid { rect: PaintRect; color: number[] }
export type CanvasLayer =
  | { kind: "source"; source: string }
  | { kind: "group"; opacity: number; layers: CanvasLayer[] }
  | { kind: "blur"; sources: string[]; rect: PaintRect }
  | { kind: "selection"; regions: PaintRect[]; layers: CanvasLayer[] }
  | { kind: "backdrop"; rect: PaintRect; clip: PaintRect; roundedClips: PaintClip[]; radius: number; saturation: number }
  | ({ kind: "solid" } & PaintSolid);
interface Target { texture: WebGLTexture; buffer: WebGLFramebuffer; width: number; height: number }
const vertex = `
attribute vec2 a_position;
uniform vec2 u_size;
uniform vec4 u_rect;
uniform vec2 u_origin;
uniform vec4 u_axes;
uniform float u_affine;
varying vec2 v_uv;
varying vec2 v_position;
void main() {
  v_uv = a_position;
  vec2 p = u_rect.xy + a_position * u_rect.zw;
  if (u_affine > 0.5) p = u_origin + a_position.x * u_axes.xy + a_position.y * u_axes.zw;
  v_position = p;
  gl_Position = vec4(p.x / u_size.x * 2.0 - 1.0, 1.0 - p.y / u_size.y * 2.0, 0, 1);
}`;
// Every texture uses top-left UVs (framebuffer textures are flipped explicitly).
const fragment = `
precision highp float;
uniform vec2 u_size;
varying vec2 v_uv;
varying vec2 v_position;
uniform sampler2D u_mask;
uniform vec4 u_maskRect;
uniform float u_masked;
uniform sampler2D u_under;
uniform float u_replace;
uniform float u_saturation;
uniform vec4 u_color;
uniform float u_colorize;
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
  if (u_colorize > 0.5) c = vec4(u_color.rgb * c.a * u_color.a, c.a * u_color.a);
  c.rgb = mix(vec3(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722))), c.rgb, u_saturation);
  c = (c * (1.0 - u_tint.a) + vec4(u_tint.rgb * u_tint.a, u_tint.a)) * u_opacity;
  if (u_replace > 0.5) {
    vec2 screenUV = vec2(v_position.x / u_size.x, 1.0 - v_position.y / u_size.y);
    gl_FragColor = mix(texture2D(u_under, screenUV), c, coverage);
  } else gl_FragColor = c * coverage;
}`;

/** Ordered page composition. Selected-source effects preserve unselected
 * layers at their original positions; backdrop effects read the already drawn
 * page, including its background. Opacity applies once to each isolated group. */
export class CanvasCompositor {
  readonly gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private vertices: WebGLBuffer;
  private targets: Target[] = [];
  private groups: Target[] = [];
  private filters: Target[][] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private masks = new Map<string, { texture: WebGLTexture; width: number; height: number }>();
  private solidTexture: WebGLTexture | undefined;
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
    for (const name of ["size", "rect", "step", "flip", "opacity", "tint", "image", "mask", "maskRect", "masked", "under", "replace", "saturation", "color", "colorize", "origin", "axes", "affine"]) this.locations[name] = gl.getUniformLocation(this.program, "u_" + name);
    gl.uniform1i(this.locations.image, 0); gl.uniform1i(this.locations.mask, 1); gl.uniform1i(this.locations.under, 2);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }
  upload(canvas: HTMLCanvasElement, filter?: string) {
    const texture = this.makeTexture(), gl = this.gl;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    if (!filter || filter === "none") return texture;
    const shadow = filter.includes("drop-shadow") ? readBoxShadow(filter) : undefined;
    const radius = shadow ? shadow.blur : Number(/blur\(([\d.]+)px\)/.exec(filter)?.[1] ?? 0);
    if (!shadow && !/^blur\([\d.]+px\)$/.test(filter)) { this.remove(texture); throw new Error("Unsupported Canvas filter: " + filter); }
    const pool: Target[] = [], filtered = this.blurTexture(texture, false, canvas.width, canvas.height, radius * this.dpr, pool);
    const projection = { width: canvas.width, height: canvas.height }, full = { x: 0, y: 0, ...projection };
    let result = filtered;
    if (shadow) {
      result = this.createTarget(canvas.width, canvas.height); this.target(result);
      const parts = shadow.color.match(/[\d.]+/g)!.map(Number), color = [parts[0]/255, parts[1]/255, parts[2]/255, parts[3] ?? 1];
      this.draw(filtered.texture, { ...full, x: shadow.x * this.dpr, y: shadow.y * this.dpr }, 1, true, [0,0], [0,0,0,0], undefined, undefined, 1, projection, color);
      this.draw(texture, full, 1, false, [0,0], [0,0,0,0], undefined, undefined, 1, projection);
    }
    this.remove(texture);
    for (const target of pool) { if (target !== result) this.remove(target.texture); gl.deleteFramebuffer(target.buffer); }
    if (shadow) gl.deleteFramebuffer(result.buffer);
    this.target(null, false);
    return result.texture;
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
    [...this.targets, ...this.groups, ...this.filters.reduce<Target[]>((all, set) => all.concat(set), [])].forEach(t => { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.buffer); });
    this.groups = []; this.filters = [];
    this.targets = Array.from({ length: 1 }, () => this.createTarget());
  }
  private createTarget(width = this.canvas.width, height = this.canvas.height): Target {
    const gl = this.gl, texture = this.makeTexture(), buffer = gl.createFramebuffer()!;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Canvas framebuffer incomplete");
    return { texture, buffer, width, height };
  }
  private sizedTarget(pool: Target[], index: number, width: number, height: number) {
    let target = pool[index];
    if (target && (target.width !== width || target.height !== height)) { this.remove(target.texture); this.gl.deleteFramebuffer(target.buffer); target = undefined!; }
    return pool[index] = target ?? this.createTarget(width, height);
  }
  /** A large radius must not turn a fixed kernel into sparse samples of text.
   * Bilinear 2× reductions progressively average the input; the Gaussian then
   * samples at most one reduced-resolution texel per tap. All filters share
   * this path, with ordinary linear upsampling when the result is composed. */
  private blurTexture(texture: WebGLTexture, flip: boolean, width: number, height: number, radius: number, pool: Target[], index = 0) {
    const full = { x: 0, y: 0, width: 1, height: 1 }, projection = { width: 1, height: 1 };
    let w = width, h = height;
    while (Math.max(radius*w/width, radius*h/height) > 4 && (w > 1 || h > 1)) {
      w = Math.max(1, Math.ceil(w/2)); h = Math.max(1, Math.ceil(h/2));
      const reduced = this.sizedTarget(pool, index++, w, h); this.target(reduced);
      this.draw(texture, full, 1, flip, [0,0], [0,0,0,0], undefined, undefined, 1, projection);
      texture = reduced.texture; flip = true;
    }
    const horizontal = this.sizedTarget(pool, index++, w, h), filtered = this.sizedTarget(pool, index, w, h);
    this.target(horizontal); this.draw(texture, full, 1, flip, [radius/4/width,0], [0,0,0,0], undefined, undefined, 1, projection);
    this.target(filtered); this.draw(horizontal.texture, full, 1, true, [0,radius/4/height], [0,0,0,0], undefined, undefined, 1, projection);
    return filtered;
  }
  private target(target: Target | null, clear = true) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.buffer ?? null);
    gl.viewport(0, 0, target?.width ?? this.canvas.width, target?.height ?? this.canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    if (clear) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  }
  private draw(texture: WebGLTexture, rect: PaintRect, opacity = 1, flip = false, step = [0, 0], tint = [0, 0, 0, 0], mask?: { texture: WebGLTexture; rect: PaintRect }, under?: WebGLTexture, saturation = 1, projection = { width: this.width, height: this.height }, color?: number[], quad?: PaintQuad) {
    const gl = this.gl, u = this.locations;
    gl.uniform1f(u.masked, mask ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mask?.texture ?? texture);
    if (mask) gl.uniform4f(u.maskRect, mask.rect.x, mask.rect.y, mask.rect.width, mask.rect.height);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, under ?? texture);
    gl.uniform1f(u.replace, under ? 1 : 0); gl.uniform1f(u.saturation, saturation);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform2f(u.size, projection.width, projection.height);
    gl.uniform1f(u.colorize, color ? 1 : 0); gl.uniform4fv(u.color, color ?? [0,0,0,0]);
    gl.uniform1f(u.affine, quad ? 1 : 0);
    if (quad) { gl.uniform2f(u.origin, quad.x, quad.y); gl.uniform4f(u.axes, quad.ax, quad.ay, quad.bx, quad.by); }
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
    const key = JSON.stringify([this.dpr, shapes, Math.max(0, right - left), Math.max(0, bottom - top)]);
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
  /** Mark only earlier selected commands, then coalesce consecutive runs in
   * each opacity scope. Unselected layers keep their original paint positions. */
  private canvasTexture() {
    if (!this.solidTexture) {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1, 1);
      this.solidTexture = this.upload(canvas);
    }
    return this.solidTexture;
  }
  private selections(layers: CanvasLayer[]) {
    const earlier: Extract<CanvasLayer, { kind: "source" }>[] = [];
    const regions = new Map<CanvasLayer, PaintRect[]>();
    const scan = (layers: CanvasLayer[]) => {
      for (const layer of layers) {
        if (layer.kind === "source") earlier.push(layer);
        else if (layer.kind === "group") scan(layer.layers);
        else if (layer.kind === "blur") {
          const selected = new Set(layer.sources);
          for (const source of earlier) if (selected.has(source.source)) regions.set(source, [...(regions.get(source) ?? []), layer.rect]);
        }
      }
    };
    scan(layers);
    const replace = (layers: CanvasLayer[]): CanvasLayer[] => {
      const result: CanvasLayer[] = [];
      let run: Extract<CanvasLayer, { kind: "selection" }> | undefined, key = "";
      for (const layer of layers) {
        if (layer.kind === "blur") continue;
        const selected = regions.get(layer), nextKey = selected && JSON.stringify(selected);
        if (selected) {
          if (!run || key !== nextKey) { run = { kind: "selection", regions: selected, layers: [] }; result.push(run); key = nextKey!; }
          run.layers.push(layer);
        } else {
          run = undefined;
          result.push(layer.kind === "group" ? { ...layer, layers: replace(layer.layers) } : layer);
        }
      }
      return result;
    };
    return replace(layers);
  }
  render(sources: { [id: string]: PaintPlacement[] }, layers: CanvasLayer[], opacity = 1) {
    const composed = this.targets[0], usedMasks = new Set<string>(), gl = this.gl;
    const full = { x: 0, y: 0, width: this.width, height: this.height };
    const scratch = (depth: number) => this.filters[depth] ?? (this.filters[depth] = [this.createTarget()]);
    const blur = (input: Target, depth: number, radius: number) => this.blurTexture(input.texture, true, input.width, input.height, radius*this.dpr, scratch(depth), 1);
    const drawSource = (id: string) => {
      (sources[id] ?? []).forEach(p => {
        if (p.clip) this.clip(p.clip); else gl.disable(gl.SCISSOR_TEST);
        const rounded = p.roundedClips?.filter(c => {
          if (p.quad) return true;
          const r = c.rect, a = c.radii, b = p.rect;
          return !(b.y >= r.y + Math.max(a[0].y, a[1].y) && b.y + b.height <= r.y + r.height - Math.max(a[2].y, a[3].y) ||
            b.x >= r.x + Math.max(a[0].x, a[3].x) && b.x + b.width <= r.x + r.width - Math.max(a[1].x, a[2].x));
        });
        const mask = rounded?.length ? this.mask(rounded, usedMasks, p.clip ?? full) : undefined;
        this.draw(p.texture, p.rect, p.opacity, !!p.flip, [0, 0], [0, 0, 0, 0], mask, undefined, 1, undefined, undefined, p.quad);
      });
      gl.disable(gl.SCISSOR_TEST);
    };
    const compose = (layers: CanvasLayer[], output: Target, depth = 0) => {
      this.target(output);
      for (const layer of layers) {
        if (layer.kind === "source") drawSource(layer.source);
        else if (layer.kind === "group" || layer.kind === "selection") {
          const group = this.groups[depth] ?? (this.groups[depth] = this.createTarget());
          compose(layer.layers, group, depth + 1);
          if (layer.kind === "selection") {
            const filtered = blur(group, depth, 4);
            this.target(group, false); gl.disable(gl.BLEND);
            for (const rect of layer.regions) { this.clip(rect); this.draw(filtered.texture, full, 1, true); }
            gl.enable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
          }
          this.target(output, false); this.draw(group.texture, full, layer.kind === "group" ? layer.opacity : 1, true);
        } else if (layer.kind === "solid") {
          this.draw(this.canvasTexture(), layer.rect, layer.color[3], true, [0, 0], [...layer.color.slice(0, 3), 1]);
        } else if (layer.kind === "backdrop") {
          const original = this.sizedTarget(scratch(depth), 0, this.canvas.width, this.canvas.height);
          this.target(original); this.draw(output.texture, full, 1, true);
          const filtered = blur(original, depth, layer.radius);
          this.target(output, false); this.clip(layer.clip);
          const mask = layer.roundedClips.length ? this.mask(layer.roundedClips, usedMasks, layer.clip) : undefined;
          gl.disable(gl.BLEND);
          this.draw(filtered.texture, full, 1, true, [0, 0], [0, 0, 0, 0], mask, original.texture, layer.saturation);
          gl.enable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
        }
      }
    };
    compose(this.selections(layers), composed);
    this.target(null); this.draw(composed.texture, full, opacity, true);
    for (const [key, mask] of this.masks) if (!usedMasks.has(key)) { this.remove(mask.texture); this.masks.delete(key); }
    if (gl.isContextLost()) throw new Error("Canvas WebGL context lost");
  }
  dispose() {
    const gl = this.gl;
    [...this.targets, ...this.groups, ...this.filters.reduce<Target[]>((all, set) => all.concat(set), [])].forEach(t => { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.buffer); });
    this.masks.forEach(mask => this.remove(mask.texture)); this.masks.clear();
    if (this.solidTexture) this.remove(this.solidTexture);
    gl.deleteBuffer(this.vertices); gl.deleteProgram(this.program);
  }
}
