import { PaintImages, PaintRect, PaintSnapshot, readPaint, rasterPaint, readBoxShadow, shadowSnapshot } from "./CanvasPaint";
import { CanvasCompositor, CanvasLayer, PaintPlacement } from "./CanvasCompositor";
import { DOMPaintTree, intersect } from "./DOMPaintTree";
import { DOMCanvasEffects } from "./DOMCanvasEffects";
import { OverlayScrollbars } from "./OverlayScrollbars";

interface Resource { canvas: HTMLCanvasElement; texture: WebGLTexture; snapshot: PaintSnapshot; version: number }

/** Paint an existing DOM subtree using a bounded CSS paint subset. The browser
 * owns layout, scroll/sticky, events and accessibility; the host owns any native
 * backdrop material. Callers supply no semantic groups or paint ordering. */
export class DOMCanvasRenderer {
  readonly canvas = document.createElement("canvas");
  readonly stats = { frames: 0, rasterizations: 0, snapshots: 0, cachedResources: 0, decorationRasterizations: 0 };
  private compositor: CanvasCompositor;
  private images: PaintImages;
  private tree: DOMPaintTree;
  private effects: DOMCanvasEffects;
  private resources = new Map<HTMLElement, Resource>();
  private decorations = new Map<HTMLElement, { texture: WebGLTexture; snapshot: PaintSnapshot; key: string }>();
  private dirty = new Set<HTMLElement>();
  private near = new Set<HTMLElement>();
  private members = new Set<HTMLElement>();
  private topologyDirty = true;
  private version = 0;
  private rootStyleVersion = -1;
  private rootOpacity = 1;
  private frame = 0;
  private disposed = false;
  private dragImage: HTMLCanvasElement | null = null;
  private observed = false;
  private mutations: MutationObserver;
  private ancestors: MutationObserver;
  private sizes: ResizeObserver;
  private intersections: IntersectionObserver;
  private scrollbars: OverlayScrollbars | undefined;
  private suppression = document.createElement("style");
  private cleanup: (() => void)[] = [];

  constructor(readonly source: HTMLElement, readonly shell: HTMLElement) {
    this.canvas.className = "dom-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    Object.assign(this.canvas.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none" });
    this.compositor = new CanvasCompositor(this.canvas);
    this.images = new PaintImages(() => this.invalidate(), error => this.fail(error));
    // Generic, root-only suppression is owned by the renderer, not app CSS.
    this.suppression.textContent = "[data-canvas-rendered] { opacity: 0 !important; }";
    document.head.appendChild(this.suppression);
    shell.appendChild(this.canvas);
    this.intersections = new IntersectionObserver(entries => {
      this.observed = true;
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.isIntersecting) this.near.add(element); else this.near.delete(element);
      }
      this.schedule();
    }, { root: source, rootMargin: "128px 0px" });
    this.sizes = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === source) { this.version++; this.topologyDirty = true; }
        else this.dirty.add(entry.target as HTMLElement);
      }
      this.schedule();
    });
    this.sizes.observe(source);
    this.mutations = new MutationObserver(records => {
      let changed = false;
      for (const record of records) {
        if (record.type === "attributes" && record.attributeName === "data-canvas-rendered") continue;
        changed = true;
        if (record.target === source) this.rootStyleVersion = -1;
        if (record.type === "attributes" && record.attributeName === "style" && this.members.has(record.target as HTMLElement)) {
          const before = document.createElement("span").style, after = document.createElement("span").style;
          before.cssText = record.oldValue ?? ""; after.cssText = (record.target as HTMLElement).style.cssText;
          for (const property of ["transform", "transform-origin", "opacity", "z-index", "box-shadow", "transition", "transition-duration"]) { before.removeProperty(property); after.removeProperty(property); }
          if (before.cssText === after.cssText) continue;
        }
        this.topologyDirty = true;
        let element = record.target instanceof Element ? record.target : record.target.parentElement;
        while (element && element !== source && !this.members.has(element as HTMLElement)) element = element.parentElement;
        if (element && this.members.has(element as HTMLElement)) this.dirty.add(element as HTMLElement); else this.version++;
      }
      if (changed) this.schedule();
    });
    this.mutations.observe(source, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true });
    this.ancestors = new MutationObserver(records => {
      const paintChanged = records.some(record => {
        if (record.target !== shell || record.attributeName !== "style") return true;
        // Host placement moves both surfaces. Inherited colors/fonts/custom
        // properties still invalidate paint; size changes also reach ResizeObserver.
        const before = document.createElement("span").style, after = document.createElement("span").style;
        before.cssText = record.oldValue ?? ""; after.cssText = shell.style.cssText;
        for (const property of ["transform", "transform-origin", "opacity", "transition", "box-shadow"]) { before.removeProperty(property); after.removeProperty(property); }
        return before.cssText !== after.cssText;
      });
      if (paintChanged) this.invalidate();
    });
    for (let ancestor = source.parentElement; ancestor; ancestor = ancestor.parentElement) this.ancestors.observe(ancestor, { attributes: true, attributeOldValue: true, attributeFilter: ["class", "style", "lang"] });
    const listen = (target: EventTarget, name: string, fn: EventListener, capture = false) => {
      target.addEventListener(name, fn, { capture, passive: true });
      this.cleanup.push(() => target.removeEventListener(name, fn, capture));
    };
    listen(source, "scroll", event => {
      // An unfragmented cached parent may contain an ordinary nested scroller.
      // Explicit overlay viewports are split by DOMPaintTree instead.
      if (event.target !== source) {
        let owner = event.target as HTMLElement | null;
        while (owner && !this.members.has(owner)) owner = owner.parentElement;
        if (owner && !this.tree?.byElement.get(owner)?.ownOnly) this.dirty.add(owner);
      }
      this.schedule();
    }, true);
    for (const event of ["pointerover", "pointerout", "pointerdown", "focusin", "focusout", "keydown", "keyup"]) listen(source, event, () => this.invalidate(), true);
    listen(source, "dragstart", event => {
      const drag = event as DragEvent;
      let element = drag.target as HTMLElement | null;
      while (element && !this.resources.has(element)) element = element.parentElement;
      const resource = element && this.resources.get(element);
      if (!resource || !drag.dataTransfer) return;
      this.dragImage = resource.canvas;
      Object.assign(this.dragImage.style, { position: "fixed", left: "-10000px", top: "0", width: `${resource.snapshot.width}px`, height: `${resource.snapshot.height}px`, pointerEvents: "none" });
      document.body.appendChild(this.dragImage);
      const bounds = element!.getBoundingClientRect();
      drag.dataTransfer.setDragImage(this.dragImage, Math.max(0, drag.clientX - bounds.left), Math.max(0, drag.clientY - bounds.top));
    });
    listen(window, "dragend", () => { this.dragImage?.remove(); this.dragImage = null; });
    listen(window, "pointerup", () => this.invalidate()); listen(window, "pointercancel", () => this.invalidate());
    listen(window, "resize", () => this.invalidate()); listen(document, "visibilitychange", () => this.schedule());
    for (const event of ["transitionrun", "transitionend", "transitioncancel", "animationstart", "animationend", "animationcancel"]) listen(source, event, () => this.schedule(), true);
    listen(this.canvas, "webglcontextlost", () => this.fail(new Error("Canvas WebGL context lost")));
    document.fonts?.ready.then(() => { if (!this.disposed) this.invalidate(); });
    if (document.fonts) listen(document.fonts, "loadingdone", () => this.invalidate());
    try { this.scrollbars = new OverlayScrollbars(source, shell, () => this.schedule()); }
    catch (error) { this.dispose(); throw error; }
    this.schedule();
  }
  invalidate() { this.version++; this.schedule(); }
  private schedule() { if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(() => this.paint()); }
  private rebuild() {
    this.topologyDirty = false;
    this.scrollbars?.sync();
    this.effects = new DOMCanvasEffects(this.source);
    this.tree = new DOMPaintTree(this.source, this.effects.selectedSources);
    const next = new Set(this.tree.units.map(unit => unit.element));
    for (const element of this.members) if (!next.has(element)) { this.intersections.unobserve(element); this.sizes.unobserve(element); this.near.delete(element); }
    for (const element of next) if (!this.members.has(element)) { this.intersections.observe(element); this.sizes.observe(element); }
    this.members = next;
  }
  private paint() {
    this.frame = 0;
    if (this.disposed || document.visibilityState === "hidden") return;
    try {
      if (this.topologyDirty) this.rebuild();
      if (!this.observed) return;
      const origin = this.source.getBoundingClientRect(), host = this.shell.getBoundingClientRect();
      const width = this.source.clientWidth, height = this.source.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (!width || !height) {
        this.canvas.style.width = this.canvas.style.height = "0px";
        this.scrollbars?.hide();
        return;
      }
      if (this.rootStyleVersion !== this.version) {
        const active = this.source.hasAttribute("data-canvas-rendered");
        if (active) this.source.removeAttribute("data-canvas-rendered");
        this.rootOpacity = Number(getComputedStyle(this.source).opacity);
        if (active) this.source.setAttribute("data-canvas-rendered", "");
        this.rootStyleVersion = this.version;
      }
      const snapshots = new Map<HTMLElement, PaintSnapshot>();
      const placements = new Map<HTMLElement, { rect: PaintRect; opacity: number; selectionOpacity: number; clip: PaintRect }>();
      const wanted = new Set([...this.near, ...this.effects.elements]);
      const styles = new Map<HTMLElement, CSSStyleDeclaration>(), bounds = new Map<HTMLElement, DOMRect>();
      for (const element of this.tree.ancestors(wanted)) { styles.set(element, getComputedStyle(element)); bounds.set(element, element.getBoundingClientRect()); }
      const rect = (r: DOMRect): PaintRect => ({ x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height });
      for (const element of wanted) {
        const unit = this.tree.byElement.get(element);
        if (!unit || !this.members.has(element)) continue;
        const r = bounds.get(element)!, style = styles.get(element)!;
        if (!r.width || r.bottom < origin.top - 128 || r.top > origin.top + height + 128 || style.display === "none" || style.visibility === "hidden") continue;
        let clip: PaintRect = { x: 0, y: 0, width, height }, selectionOpacity = element === this.source ? 1 : Number(style.opacity);
        for (let parent = element.parentElement; parent && this.source.contains(parent); parent = parent.parentElement) {
          const s = styles.get(parent)!;
          if (parent !== this.source) selectionOpacity *= Number(s.opacity);
          if (s.overflowX !== "visible" || s.overflowY !== "visible" || /paint|strict|content/.test(s.contain)) clip = intersect(clip, rect(bounds.get(parent)!));
        }
        placements.set(element, { rect: rect(r), opacity: 1, selectionOpacity, clip });
        const old = this.resources.get(element), layoutWidth = element.offsetWidth ?? parseFloat(style.width), layoutHeight = element.offsetHeight ?? parseFloat(style.height);
        if (!old || old.version !== this.version || this.dirty.has(element) || old.snapshot.layoutWidth !== layoutWidth || old.snapshot.layoutHeight !== layoutHeight) {
          snapshots.set(element, readPaint(element, this.images, unit.ownOnly)); this.stats.snapshots++;
        }
      }
      // CSS paint order, custom effects and native scroll decorations are read
      // before touching Canvas or GPU state.
      const activeUnits = Array.from(placements.keys()).map(element => this.tree.byElement.get(element)!);
      const order = this.tree.order(styles, new Set(placements.keys()));
      const layers: CanvasLayer[] = [], stack: { layers: CanvasLayer[]; opacity: number }[] = [{ layers, opacity: 1 }];
      for (const entry of order) {
        if (entry.kind === "begin") stack.push({ layers: [], opacity: entry.opacity! });
        else if (entry.kind === "end") { const group = stack.pop()!; stack[stack.length - 1].layers.push({ kind: "group", ...group }); }
        else if (entry.kind === "effect") stack[stack.length - 1].layers.push(this.effects.layer(entry.element, activeUnits, rect(bounds.get(entry.element)!)));
        else stack[stack.length - 1].layers.push({ kind: "source", source: entry.unit!.id + "/shadow" }, { kind: "source", source: entry.unit!.id });
      }
      const shadows = new Map<HTMLElement, ReturnType<typeof readBoxShadow>>();
      for (const element of placements.keys()) shadows.set(element, readBoxShadow(styles.get(element)!.boxShadow));
      layers.push(...(this.scrollbars?.measure(origin, width, height) ?? []));
      const animations = this.source.getAnimations({ subtree: true }).filter(a => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity);
      Object.assign(this.canvas.style, { left: `${origin.x - host.x}px`, top: `${origin.y - host.y}px`, width: `${width}px`, height: `${height}px` });
      this.compositor.resize(width, height, dpr);
      for (const [element, snapshot] of snapshots) {
        const old = this.resources.get(element); if (old) this.compositor.remove(old.texture);
        const canvas = rasterPaint({ ...snapshot, shadow: undefined }, dpr);
        this.resources.set(element, { canvas, texture: this.compositor.upload(canvas), snapshot, version: this.version }); this.stats.rasterizations++;
      }
      for (const [element, resource] of this.resources) if (!placements.has(element)) { this.compositor.remove(resource.texture); this.resources.delete(element); }
      for (const [element, resource] of this.resources) {
        const shadow = shadows.get(element), old = this.decorations.get(element);
        if (!shadow) { if (old) { this.compositor.remove(old.texture); this.decorations.delete(element); } continue; }
        const key = [JSON.stringify(shadow), resource.snapshot.layoutWidth, resource.snapshot.layoutHeight, resource.snapshot.root.radii.join(), dpr].join("|");
        if (old?.key === key) continue;
        if (old) this.compositor.remove(old.texture);
        const snapshot = shadowSnapshot(resource.snapshot, shadow);
        this.decorations.set(element, { texture: this.compositor.upload(rasterPaint(snapshot, dpr)), snapshot, key }); this.stats.decorationRasterizations++;
      }
      for (const [element, resource] of this.decorations) if (!placements.has(element)) { this.compositor.remove(resource.texture); this.decorations.delete(element); }
      this.dirty.clear();
      const sources: { [id: string]: PaintPlacement[] } = {};
      for (const unit of activeUnits) {
        const placement = placements.get(unit.element), resource = this.resources.get(unit.element);
        sources[unit.id] = []; sources[unit.id + "/shadow"] = [];
        if (!placement || !resource) continue;
        const surface = (s: PaintSnapshot, texture: WebGLTexture): PaintPlacement => {
          const sx = s.layoutWidth ? placement.rect.width / s.layoutWidth : 1, sy = s.layoutHeight ? placement.rect.height / s.layoutHeight : 1;
          return { ...placement, texture, rect: { x: placement.rect.x + s.offsetX * sx, y: placement.rect.y + s.offsetY * sy, width: s.width * sx, height: s.height * sy } };
        };
        sources[unit.id].push(surface(resource.snapshot, resource.texture));
        const decoration = this.decorations.get(unit.element);
        if (decoration) sources[unit.id + "/shadow"].push(surface(decoration.snapshot, decoration.texture));
      }
      this.compositor.render(sources, layers, this.rootOpacity);
      this.scrollbars?.commit(origin.x - host.x, origin.y - host.y, width, height);
      this.stats.frames++; this.stats.cachedResources = this.resources.size;
      if (!this.source.hasAttribute("data-canvas-rendered")) this.source.setAttribute("data-canvas-rendered", "");
      if (animations.length) {
        animations.forEach(a => {
          let target = (a.effect as KeyframeEffect).target as HTMLElement | null;
          const keys = (a.effect as KeyframeEffect).getKeyframes();
          if (target && this.members.has(target) && keys.every(k => Object.keys(k).every(name => ["offset", "computedOffset", "easing", "composite", "transform", "opacity"].includes(name)))) return;
          while (target && !this.members.has(target)) target = target.parentElement;
          if (target) this.dirty.add(target);
        }); this.schedule();
      }
    } catch (error) { this.fail(error); }
  }
  private fail(error: unknown) { if (!this.disposed) { console.warn("[DOMCanvasRenderer] Restoring DOM paint", error); this.dispose(); } }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    cancelAnimationFrame(this.frame); this.frame = 0; this.source.removeAttribute("data-canvas-rendered");
    this.mutations.disconnect(); this.ancestors.disconnect(); this.sizes.disconnect(); this.intersections.disconnect();
    this.cleanup.forEach(fn => fn()); this.images.dispose(); this.scrollbars?.dispose();
    this.resources.forEach(r => this.compositor.remove(r.texture)); this.resources.clear();
    this.decorations.forEach(r => this.compositor.remove(r.texture)); this.decorations.clear();
    this.dragImage?.remove(); this.dragImage = null;
    this.compositor.dispose(); this.canvas.remove(); this.suppression.remove(); this.stats.cachedResources = 0;
  }
}
