import { boxOrigin, isAxisAligned, readBasis } from "./DOMPaintGeometry";
import { PaintImages, PaintClip, PaintRect, readOverflowClip, PaintSnapshot, readPaint, readPaintSize, rasterPaint, readBoxShadow, shadowSnapshot } from "./CanvasPaint";
import { CanvasCompositor, CanvasLayer, PaintPlacement } from "./CanvasCompositor";
import { DOMPaintTree, intersect } from "./DOMPaintTree";
import { DOMCanvasEffects } from "./DOMCanvasEffects";
import { DOMTextEditing } from "./DOMTextEditing";
import { OverlayScrollbars } from "./OverlayScrollbars";

interface Resource { canvas: HTMLCanvasElement; texture: WebGLTexture; snapshot: PaintSnapshot; version: number; dpr: number; ownOnly: boolean }

/** Paint an existing DOM subtree using a bounded CSS paint subset. The browser
 * owns layout, scroll/sticky, events and accessibility; the host owns any native
 * backdrop material. Callers supply no semantic groups or paint ordering. */
export class DOMCanvasRenderer {
  readonly canvas = document.createElement("canvas");
  readonly stats = { frames: 0, rasterizations: 0, snapshots: 0, cachedResources: 0, decorationRasterizations: 0, cachedImages: 0 };
  private compositor: CanvasCompositor;
  private images: PaintImages;
  private tree: DOMPaintTree;
  private effects: DOMCanvasEffects;
  private resources = new Map<HTMLElement, Resource>();
  private decorations = new Map<HTMLElement, { texture: WebGLTexture; snapshot: PaintSnapshot; pixelWidth: number; pixelHeight: number; key: string }>();
  private dirty = new Set<HTMLElement>();
  private members = new Set<HTMLElement>();
  private topologyDirty = true;
  private effectsDirty = false;
  private effectElements = new Set<HTMLElement>();
  private version = 0;
  private rootStyleVersion = -1;
  private rootOpacity = 1;
  private frame = 0;
  private disposed = false;
  private nativePresentation = false;
  private videos = new Map<HTMLVideoElement, number>();
  private dragImage: HTMLCanvasElement | null = null;
  private mutations: MutationObserver;
  private ancestors: MutationObserver;
  private sizes: ResizeObserver;
  private sizeTargets = new Set<HTMLElement>();
  private measuredSizes = new WeakMap<HTMLElement, { width: number; height: number }>();
  private pending = new Map<Element, "box" | "children" | "subtree">();
  private scrollbars: OverlayScrollbars | undefined;
  private editing: DOMTextEditing;
  private selectedResources = new Set<HTMLElement>();
  private suppression = document.createElement("style");
  private cleanup: (() => void)[] = [];

  constructor(readonly source: HTMLElement, readonly shell: HTMLElement, private options: { autoScrollbars?: boolean } = {}) {
    this.canvas.className = "dom-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    Object.assign(this.canvas.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", transformOrigin: "0 0", pointerEvents: "none" });
    this.compositor = new CanvasCompositor(this.canvas);
    this.editing = new DOMTextEditing(source, () => this.editingChanged());
    this.images = new PaintImages(url => {
      for (const [element, resource] of this.resources) if (resource.snapshot.imageUrls.includes(url)) this.dirty.add(element);
      this.schedule();
    }, error => this.fail(error));
    // Generic, root-only suppression is owned by the renderer, not app CSS.
    this.suppression.textContent = "[data-canvas-rendered] { opacity: 0 !important; }";
    document.head.appendChild(this.suppression);
    shell.appendChild(this.canvas);
    this.sizes = new ResizeObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const size = readPaintSize(element), previous = this.measuredSizes.get(element);
        this.measuredSizes.set(element, size);
        if (previous && size.width === previous.width && size.height === previous.height) continue;
        if (element === source) { this.version++; this.topologyDirty = true; }
        else { this.markDirty(element); this.queueRefresh(element, true); }
      }
      this.schedule();
    });
    this.measuredSizes.set(source, readPaintSize(source));
    this.sizes.observe(source); this.sizeTargets.add(source);
    this.mutations = new MutationObserver(records => {
      let changed = false;
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.closest("[data-canvas-owned]")) continue;
        if (record.type === "childList" && [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].every(node => node instanceof Element && node.hasAttribute("data-canvas-owned"))) continue;
        if (this.scrollbars?.ownsMutation(record)) continue;
        if (record.type === "attributes" && (record.attributeName === "data-canvas-rendered" ||
          (record.target as Element).getAttribute(record.attributeName!) === record.oldValue)) continue;
        changed = true;
        const element = record.target instanceof Element ? record.target : record.target.parentElement;
        if (!element) continue;
        if (element === source && record.type === "attributes") {
          this.rootStyleVersion = -1; this.version++; this.topologyDirty = true;
        } else {
          // Placement-only changes of a root or structural ancestor preserve cached pixels.
          // Boundary/context metadata is still refreshed, including z-index.
          let placementOnly = false;
          if (record.type === "attributes" && record.attributeName === "style") {
            const before = document.createElement("span").style, after = document.createElement("span").style;
            before.cssText = record.oldValue ?? ""; after.cssText = (element as HTMLElement).style.cssText;
            for (const property of ["transform", "transform-origin", "opacity", "z-index", "box-shadow", "transition", "transition-duration"]) { before.removeProperty(property); after.removeProperty(property); }
            placementOnly = before.cssText === after.cssText;
          }
          if (placementOnly) this.dirtyContainingAtomic(element); else this.markDirty(element);
          const textOnly = record.type === "childList" && [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].every(node => node instanceof Text);
          this.queueRefresh(element, placementOnly || record.type === "characterData" || textOnly, record.type === "childList" && !textOnly);
          // Selector membership may change without changing any pixels or
          // boundaries elsewhere. Refresh effect selections once per batch,
          // then update only the branches whose selection actually changed.
          if (record.attributeName === "data-canvas-blur") {
            if (element.hasAttribute("data-canvas-blur")) this.effectElements.add(element as HTMLElement); else this.effectElements.delete(element as HTMLElement);
            this.effectsDirty = true;
          }
          for (const removed of Array.from(record.removedNodes)) if (removed instanceof Element) for (const effect of this.effectElements) if (removed.contains(effect)) this.effectElements.delete(effect);
          for (const added of Array.from(record.addedNodes)) if (added instanceof Element) {
            if (added.hasAttribute("data-canvas-blur")) this.effectElements.add(added as HTMLElement);
            added.querySelectorAll<HTMLElement>("[data-canvas-blur]").forEach(effect => this.effectElements.add(effect));
          }
          if (this.effectElements.size || this.effects?.elements.length) this.effectsDirty = true;
        }
      }
      if (changed) this.schedule();
    });
    this.mutations.observe(source, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true });
    this.ancestors = new MutationObserver(records => {
      const paintChanged = records.some(record => {
        if ((record.target as Element).getAttribute(record.attributeName!) === record.oldValue) return false;
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
    for (const name of ["loadeddata", "seeked", "timeupdate", "play", "pause", "resize"]) listen(source, name, event => {
      if (event.target instanceof HTMLVideoElement) this.invalidate(event.target);
    }, true);
    listen(source, "error", event => { if (event.target instanceof HTMLVideoElement && event.target.currentSrc) this.fail(new Error("Canvas video could not be decoded")); }, true);
    listen(source, "load", event => this.invalidate(event.target as Element), true);
    // The owner of an ordinary canvas dispatches this after changing its pixels.
    // Canvas drawing itself has no DOM mutation notification.
    listen(source, "canvas-content-changed", event => this.invalidate(event.target as Element), true);
    for (const event of ["input", "change", "pointerover", "pointerout", "pointerdown", "focusin", "focusout", "keydown", "keyup"]) listen(source, event, event => this.invalidate(event.target as Element), true);
    let pressed: Element | undefined;
    listen(source, "pointerdown", event => { pressed = event.target as Element; }, true);
    listen(source, "dragstart", event => {
      const drag = event as DragEvent;
      let element = drag.target as HTMLElement | null;
      while (element && !this.resources.has(element)) element = element.parentElement;
      const resource = element && this.resources.get(element);
      if (!resource || !drag.dataTransfer) return;
      this.dragImage = resource.canvas;
      Object.assign(this.dragImage.style, { position: "fixed", left: "-10000px", top: "0", width: `${resource.snapshot.width}px`, height: `${resource.snapshot.height}px`, pointerEvents: "none" });
      this.dragImage.setAttribute("data-canvas-owned", ""); this.dragImage.setAttribute("aria-hidden", "true");
      document.body.appendChild(this.dragImage);
      const bounds = element!.getBoundingClientRect();
      drag.dataTransfer.setDragImage(this.dragImage, Math.max(0, drag.clientX - bounds.left), Math.max(0, drag.clientY - bounds.top));
    });
    listen(window, "dragend", () => { this.dragImage?.remove(); this.dragImage = null; });
    for (const event of ["pointerup", "pointercancel"]) listen(window, event, () => {
      if (pressed) { this.invalidate(pressed); pressed = undefined; }
    });
    listen(window, "resize", () => this.invalidate()); listen(document, "visibilitychange", () => this.schedule());
    for (const event of ["transitionrun", "transitionend", "transitioncancel", "animationstart", "animationend", "animationcancel"]) listen(source, event, () => this.schedule(), true);
    listen(this.canvas, "webglcontextlost", () => this.fail(new Error("Canvas WebGL context lost")));
    document.fonts?.ready.then(() => { if (!this.disposed) this.invalidate(); });
    if (document.fonts) listen(document.fonts, "loadingdone", () => this.invalidate());
    try { this.scrollbars = new OverlayScrollbars(source, () => this.schedule(), !!options.autoScrollbars); }
    catch (error) { this.dispose(); throw error; }
    this.schedule();
  }
  private editingChanged() {
    const selected = new Set<HTMLElement>();
    for (const [element, resource] of this.resources) if (this.editing.affects(element, resource.ownOnly, !!this.tree.byElement.get(element)?.text)) selected.add(element);
    for (const element of this.selectedResources) this.dirty.add(element);
    for (const element of selected) this.dirty.add(element);
    this.selectedResources = selected;
    if (this.dirty.size) this.schedule();
  }
  private markDirty(element: Element) {
    // Retained surfaces are already viewport-bounded. Dirty containing units
    // along ancestry (including own-only :hover/:has backgrounds), then retained descendants of an invalidated
    // container; no mutation scans all offscreen paint units.
    for (let owner: HTMLElement | null = element as HTMLElement; owner && this.source.contains(owner); owner = owner.parentElement) {
      if (this.members.has(owner)) this.dirty.add(owner);
    }
    for (const member of this.resources.keys()) if (element.contains(member)) this.dirty.add(member);
  }
  private dirtyContainingAtomic(element: Element) {
    if (this.members.has(element as HTMLElement)) return;
    for (let owner = element.parentElement; owner && this.source.contains(owner); owner = owner.parentElement) if (this.members.has(owner)) {
      if (!this.tree.byElement.get(owner)?.ownOnly) this.dirty.add(owner);
      return;
    }
  }
  private queueRefresh(element: Element, shallow = false, children = false) {
    const mode = shallow ? "box" : children ? "children" : "subtree", previous = this.pending.get(element);
    if (previous === "subtree" || previous === "children" && mode === "box") return;
    this.pending.set(element, mode);
  }
  invalidate(element?: Element) {
    if (!element) { this.version++; this.topologyDirty = true; }
    else { this.markDirty(element); this.queueRefresh(element); }
    this.schedule();
  }
  private schedule() { if (!this.frame && !this.disposed && !this.nativePresentation) this.frame = requestAnimationFrame(() => this.paint()); }
  private rebuild() {
    this.topologyDirty = false;
    this.effects = new DOMCanvasEffects(this.source);
    this.effectElements = new Set(this.effects.elements);
    this.tree = new DOMPaintTree(this.source, this.effects.selectedSources);
    this.members = this.tree.members;
    this.scrollbars?.sync(this.options.autoScrollbars ? this.tree.scrollers : undefined);
    this.pending.clear(); this.effectsDirty = false;
  }
  private refresh() {
    if (this.effectsDirty) {
      this.effects = new DOMCanvasEffects(this.source, this.effectElements);
      this.tree.updateSources(this.effects.selectedSources); this.effectsDirty = false;
    }
    for (const [element, mode] of this.pending) {
      if (!this.source.contains(element)) continue;
      // An ancestor already queued for a deep refresh subsumes its descendants.
      let ancestor = element.parentElement;
      while (ancestor && !this.pending.has(ancestor)) ancestor = ancestor.parentElement;
      if (ancestor && this.pending.get(ancestor) === "subtree") continue;
      this.tree.refresh(element, mode === "box", mode === "children");
    }
    this.pending.clear();
    this.scrollbars?.sync(this.options.autoScrollbars ? this.tree.scrollers : undefined);
  }
  private observeSizes(elements: Set<HTMLElement>) {
    for (const element of this.sizeTargets) if (!elements.has(element)) { this.sizes.unobserve(element); this.sizeTargets.delete(element); }
    for (const element of elements) if (!this.sizeTargets.has(element)) { this.measuredSizes.set(element, readPaintSize(element)); this.sizes.observe(element); this.sizeTargets.add(element); }
  }
  private paint() {
    this.frame = 0;
    if (this.disposed || this.nativePresentation || document.visibilityState === "hidden") return;
    try {
      if (this.topologyDirty) this.rebuild();
      else if (this.pending.size) this.refresh();
      const origin = this.source.getBoundingClientRect(), host = this.shell.getBoundingClientRect();
      // Source and output inherit the host's translation/scale together. DOM
      // client rects already include it; paint placements must stay host-local.
      const hostSize = readPaintSize(this.shell), scaleX = host.width / hostSize.width || 1, scaleY = host.height / hostSize.height || 1;
      const left = (origin.x - host.x) / scaleX, top = (origin.y - host.y) / scaleY;
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
      // Align only an untransformed output. Intentional host/ancestor movement
      // and scaling carry both source and Canvas without quantizing the motion.
      let transformed: HTMLElement | null = this.shell;
      while (transformed && getComputedStyle(transformed).transform === "none") transformed = transformed.parentElement;
      let outputX = origin.x, outputY = origin.y;
      if (!transformed && scaleX === 1 && scaleY === 1) {
        outputX = Math.round(outputX * dpr) / dpr;
        outputY = Math.round(outputY * dpr) / dpr;
      }
      const canvasLeft = (outputX - host.x) / scaleX, canvasTop = (outputY - host.y) / scaleY;
      const snapshots = new Map<HTMLElement, PaintSnapshot>();
      const placements = new Map<HTMLElement, { rect: PaintRect; opacity: number; selectionOpacity: number; clip: PaintRect; roundedClips: PaintClip[] }>();
      const wanted = this.tree.nearby({ x: origin.left, y: origin.top - 128 * scaleY, width: origin.width, height: origin.height + 256 * scaleY }, 128 * scaleY);
      this.effects.elements.forEach(element => wanted.add(element));
      const styles = new Map<HTMLElement, CSSStyleDeclaration>(), bounds = new Map<HTMLElement, DOMRect>();
      const ancestry = this.tree.ancestors(wanted);
      this.observeSizes(ancestry);
      for (const element of ancestry) { styles.set(element, getComputedStyle(element)); bounds.set(element, element.getBoundingClientRect()); }
      const rect = (r: DOMRect): PaintRect => ({ x: (r.x - origin.x) / scaleX, y: (r.y - origin.y) / scaleY, width: r.width / scaleX, height: r.height / scaleY });
      for (const element of wanted) {
        const unit = this.tree.byElement.get(element);
        if (!unit || !this.members.has(element)) continue;
        const r = bounds.get(element)!, style = styles.get(element)!;
        if (!r.width || !r.height || r.bottom < origin.top - 128 * scaleY || r.top > origin.top + (height + 128) * scaleY || style.display === "none" || style.visibility === "hidden") continue;
        const roundedClips: PaintClip[] = [];
        let clip: PaintRect = { x: 0, y: 0, width, height }, selectionOpacity = element === this.source ? 1 : Number(style.opacity);
        for (let parent = element.parentElement; parent && this.source.contains(parent); parent = parent.parentElement) {
          const s = styles.get(parent)!;
          if (parent !== this.source) selectionOpacity *= Number(s.opacity);
          if (s.overflowX !== "visible" || s.overflowY !== "visible" || /paint|strict|content/.test(s.contain)) {
            const size = readPaintSize(parent, s), shape = readOverflowClip(s, rect(bounds.get(parent)!), size.width, size.height);
            clip = intersect(clip, shape.rect);
            if (shape.radii.some(r => r.x > 0 && r.y > 0)) roundedClips.push(shape);
          }
        }
        const placementRect = rect(r);
        placements.set(element, { rect: placementRect, opacity: 1, selectionOpacity, clip, roundedClips });
        const old = this.resources.get(element), { width: layoutWidth, height: layoutHeight } = readPaintSize(element, style);
        if (!old || old.ownOnly !== unit.ownOnly || old.version !== this.version || old.dpr !== dpr || this.dirty.has(element) || old.snapshot.layoutWidth !== layoutWidth || old.snapshot.layoutHeight !== layoutHeight) {
          snapshots.set(element, readPaint(element, this.images, placementRect, dpr, unit.ownOnly, this.editing)); this.stats.snapshots++;
        }
      }
      // CSS paint order, custom effects and native scroll decorations are read
      // before touching Canvas or GPU state.
      const activeUnits = Array.from(placements.keys()).map(element => this.tree.byElement.get(element)!);
      const order = this.tree.order(styles, new Set(placements.keys()));
      const scrollLayers = this.scrollbars?.measure(origin, width, height, scaleX, scaleY) ?? [];
      const barsBefore = new Map<number, CanvasLayer[]>(), barsAfter = new Map<number, CanvasLayer[]>();
      if (this.options.autoScrollbars) for (const [element, bars] of this.scrollbars?.paint ?? []) {
        if (!bars.length) continue;
        const end = order.findIndex(entry => entry.kind === "end" && entry.element === element);
        let index = end;
        if (index < 0) for (let i = 0; i < order.length; i++) if (element.contains(order[i].element)) index = i;
        if (index >= 0) { const map = end >= 0 ? barsBefore : barsAfter; map.set(index, [...(map.get(index) ?? []), ...bars]); }
      }
      const layers: CanvasLayer[] = [], stack: { layers: CanvasLayer[]; opacity: number }[] = [{ layers, opacity: 1 }];
      for (let index = 0; index < order.length; index++) {
        const entry = order[index];
        stack[stack.length - 1].layers.push(...(barsBefore.get(index) ?? []));
        if (entry.kind === "begin") stack.push({ layers: [], opacity: entry.opacity! });
        else if (entry.kind === "end") { const group = stack.pop()!; stack[stack.length - 1].layers.push({ kind: "group", ...group }); }
        else if (entry.kind === "effect") stack[stack.length - 1].layers.push(this.effects.layer(entry.element, activeUnits, rect(bounds.get(entry.element)!)));
        else {
          const style = styles.get(entry.element)!, placement = placements.get(entry.element)!;
          if (style.backdropFilter !== "none") {
            const size = readPaintSize(entry.element, style), shape = readOverflowClip(style, placement.rect, size.width, size.height);
            stack[stack.length - 1].layers.push({ kind: "backdrop", rect: placement.rect, clip: intersect(placement.clip, shape.rect), roundedClips: [...placement.roundedClips, shape],
              radius: Number(/blur\(([\d.]+)px\)/.exec(style.backdropFilter)?.[1] ?? 0), saturation: Number(/saturate\(([\d.]+)\)/.exec(style.backdropFilter)?.[1] ?? 1) });
          }
          stack[stack.length - 1].layers.push({ kind: "source", source: entry.unit!.id + "/shadow" }, { kind: "source", source: entry.unit!.id });
        }
        stack[stack.length - 1].layers.push(...(barsAfter.get(index) ?? []));
      }
      const bases = new Map<Element, ReturnType<typeof readBasis>>();
      for (const unit of activeUnits) readBasis(unit.element, styles, bases);
      const shadows = new Map<HTMLElement, ReturnType<typeof readBoxShadow>>();
      for (const element of placements.keys()) shadows.set(element, readBoxShadow(styles.get(element)!.boxShadow));
      if (!this.options.autoScrollbars) layers.push(...scrollLayers);
      const animations = this.source.getAnimations({ subtree: true }).filter(animation => {
        if (animation.playState !== "running") return false;
        const target = (animation.effect as KeyframeEffect)?.target;
        if (!(target instanceof Element)) return false;
        const r = target.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > origin.top && r.top < origin.bottom && r.right > origin.left && r.left < origin.right;
      });
      this.compositor.resize(width, height, dpr);
      // A composited canvas layer can round a fractional CSS box to whole CSS
      // pixels before mapping the framebuffer. Keep the layout box integral
      // and apply the backing's fractional edge padding in the final transform.
      const displayScaleX = this.canvas.width / (width * dpr), displayScaleY = this.canvas.height / (height * dpr);
      Object.assign(this.canvas.style, { left: `${canvasLeft}px`, top: `${canvasTop}px`, width: `${width}px`, height: `${height}px`,
        transform: displayScaleX === 1 && displayScaleY === 1 ? "none" : `scale(${displayScaleX}, ${displayScaleY})` });
      for (const [element, snapshot] of snapshots) {
        const old = this.resources.get(element); if (old) this.compositor.remove(old.texture);
        const canvas = rasterPaint({ ...snapshot, shadow: undefined }, dpr);
        this.resources.set(element, { canvas, texture: this.compositor.upload(canvas, snapshot.filter), snapshot, version: this.version, dpr, ownOnly: this.tree.byElement.get(element)!.ownOnly }); this.stats.rasterizations++;
      }
      for (const [element, resource] of this.resources) if (!placements.has(element)) { this.compositor.remove(resource.texture); this.resources.delete(element); }
      for (const [element, resource] of this.resources) {
        const shadow = shadows.get(element), old = this.decorations.get(element);
        if (!shadow) { if (old) { this.compositor.remove(old.texture); this.decorations.delete(element); } continue; }
        const key = [JSON.stringify(shadow), resource.snapshot.layoutWidth, resource.snapshot.layoutHeight, resource.snapshot.root.radii.join(), dpr].join("|");
        if (old?.key === key) continue;
        if (old) this.compositor.remove(old.texture);
        const snapshot = shadowSnapshot(resource.snapshot, shadow);
        const canvas = rasterPaint(snapshot, dpr);
        this.decorations.set(element, { texture: this.compositor.upload(canvas, snapshot.filter), snapshot, pixelWidth: canvas.width, pixelHeight: canvas.height, key }); this.stats.decorationRasterizations++;
      }
      for (const [element, resource] of this.decorations) if (!placements.has(element)) { this.compositor.remove(resource.texture); this.decorations.delete(element); }
      // Scrolling can introduce already-selected resources without a new
      // selectionchange. Track those too so collapsing later clears their pixels.
      this.selectedResources.clear();
      for (const [element, resource] of this.resources) if (this.editing.affects(element, resource.ownOnly, !!this.tree.byElement.get(element)?.text)) this.selectedResources.add(element);
      this.watchVideos();
      this.editing.settle();
      this.images.retain(new Set(Array.from(this.resources.values()).reduce<string[]>((urls, resource) => urls.concat(resource.snapshot.imageUrls), [])));
      this.dirty.clear();
      const sources: { [id: string]: PaintPlacement[] } = {};
      for (const unit of activeUnits) {
        const placement = placements.get(unit.element), resource = this.resources.get(unit.element);
        sources[unit.id] = []; sources[unit.id + "/shadow"] = [];
        if (!placement || !resource) continue;
        const surface = (s: PaintSnapshot, texture: WebGLTexture, pixelWidth: number, pixelHeight: number): PaintPlacement => {
          const basis = bases.get(unit.element)!;
          if (!isAxisAligned(basis)) {
            const border = boxOrigin(bounds.get(unit.element)!, basis, s.layoutWidth, s.layoutHeight);
            const quad = { x: (border.x - origin.x + basis.a * s.offsetX + basis.c * s.offsetY) / scaleX,
              y: (border.y - origin.y + basis.b * s.offsetX + basis.d * s.offsetY) / scaleY,
              ax: basis.a * pixelWidth / dpr / scaleX, ay: basis.b * pixelWidth / dpr / scaleY,
              bx: basis.c * pixelHeight / dpr / scaleX, by: basis.d * pixelHeight / dpr / scaleY };
            const x = Math.min(quad.x, quad.x+quad.ax, quad.x+quad.bx, quad.x+quad.ax+quad.bx), y = Math.min(quad.y, quad.y+quad.ay, quad.y+quad.by, quad.y+quad.ay+quad.by);
            const right = Math.max(quad.x,quad.x+quad.ax,quad.x+quad.bx,quad.x+quad.ax+quad.bx), bottom = Math.max(quad.y,quad.y+quad.ay,quad.y+quad.by,quad.y+quad.ay+quad.by);
            return { ...placement, texture, flip: !!s.filter, quad, rect: {x,y,width:right-x,height:bottom-y} };
          }
          const sx = s.layoutWidth ? placement.rect.width / s.layoutWidth : 1, sy = s.layoutHeight ? placement.rect.height / s.layoutHeight : 1;
          let x = placement.rect.x + s.offsetX * sx, y = placement.rect.y + s.offsetY * sy;
          // Keep cached, unscaled texels on the output pixel grid. Intentional
          // CSS scaling retains its geometry and LINEAR texture sampling.
          if (sx === 1 && sy === 1) { x = Math.round(x * dpr) / dpr; y = Math.round(y * dpr) / dpr; }
          // ceil allocation leaves transparent padding at the raster's edge;
          // preserve its extent instead of squeezing it into the logical box.
          return { ...placement, texture, flip: !!s.filter, rect: { x, y, width: pixelWidth / dpr * sx, height: pixelHeight / dpr * sy } };
        };
        sources[unit.id].push(surface(resource.snapshot, resource.texture, resource.canvas.width, resource.canvas.height));
        const decoration = this.decorations.get(unit.element);
        if (decoration) sources[unit.id + "/shadow"].push(surface(decoration.snapshot, decoration.texture, decoration.pixelWidth, decoration.pixelHeight));
      }
      this.compositor.render(sources, layers, this.rootOpacity);
      this.stats.frames++; this.stats.cachedResources = this.resources.size; this.stats.cachedImages = this.images.size;
      if (!this.source.hasAttribute("data-canvas-rendered")) this.source.setAttribute("data-canvas-rendered", "");
      if (animations.length) {
        animations.forEach(a => {
          let target = (a.effect as KeyframeEffect).target as HTMLElement | null;
          const keys = (a.effect as KeyframeEffect).getKeyframes();
          if (target && keys.every(k => Object.keys(k).every(name => ["offset", "computedOffset", "easing", "composite", "transform", "opacity"].includes(name)))) { this.dirtyContainingAtomic(target); return; }
          while (target && !this.members.has(target)) target = target.parentElement;
          if (target) this.dirty.add(target);
        }); this.schedule();
      }
    } catch (error) { this.fail(error); }
  }
  private watchVideos() {
    const wanted = new Set(Array.from(this.resources.values()).reduce<HTMLVideoElement[]>((all, resource) => all.concat(resource.snapshot.videos ?? []), []));
    for (const [video, id] of this.videos) if (!wanted.has(video)) { video.cancelVideoFrameCallback?.(id); this.videos.delete(video); }
    for (const video of wanted) if (!this.videos.has(video) && video.requestVideoFrameCallback) {
      const frame = () => {
        if (!this.videos.has(video) || this.disposed) return;
        this.markDirty(video); this.schedule();
        this.videos.set(video, video.requestVideoFrameCallback(frame));
      };
      this.videos.set(video, video.requestVideoFrameCallback(frame));
    }
  }
  setNativePresentation(native: boolean) {
    if (this.disposed || native === this.nativePresentation) return;
    this.nativePresentation = native;
    this.editing.settle(native);
    this.canvas.style.visibility = native ? "hidden" : "";
    this.scrollbars?.setSuspended(native);
    if (native) {
      cancelAnimationFrame(this.frame); this.frame = 0;
      this.source.removeAttribute("data-canvas-rendered");
    } else {
      this.editing.update();
      this.scrollbars?.sync(this.options.autoScrollbars ? this.tree?.scrollers : undefined);
      this.schedule();
    }
  }
  private fail(error: unknown) { if (!this.disposed) { console.warn("[DOMCanvasRenderer] Restoring DOM paint", error); this.dispose(); } }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    cancelAnimationFrame(this.frame); this.frame = 0; this.source.removeAttribute("data-canvas-rendered");
    this.mutations.disconnect(); this.ancestors.disconnect(); this.sizes.disconnect();
    this.videos.forEach((id, video) => video.cancelVideoFrameCallback?.(id)); this.videos.clear();
    this.cleanup.forEach(fn => fn()); this.editing.dispose(); this.images.dispose(); this.scrollbars?.dispose();
    this.resources.forEach(r => this.compositor.remove(r.texture)); this.resources.clear(); this.selectedResources.clear();
    this.decorations.forEach(r => this.compositor.remove(r.texture)); this.decorations.clear();
    this.dragImage?.remove(); this.dragImage = null;
    this.compositor.dispose(); this.canvas.remove(); this.suppression.remove(); this.stats.cachedResources = 0; this.stats.cachedImages = 0;
  }
}
