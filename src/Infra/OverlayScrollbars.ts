import { CanvasLayer } from "./CanvasCompositor";
import { PaintRect } from "./CanvasPaint";
import { intersect } from "./DOMPaintTree";

const declaration = '[data-canvas-scrollbar="overlay"]';
const hitThickness = 6;
const paintThickness = 4;
const hideDelay = 1000;
interface Bar {
  axis: "vertical" | "horizontal";
  track: PaintRect;
  thumb: PaintRect;
  range: number;
  travel: number;
  rtl: boolean;
}
interface Controls {
  element: HTMLElement;
  visible: boolean;
  timer?: number;
  styleAbsent: boolean;
  styles: { name: string; value: string; priority: string; owned: string }[];
  bars: Map<Bar["axis"], Bar>;
}
interface Measurement { controls: Controls; clip: PaintRect; bars: Bar[] }

/** CSS removes native bar/gutter occupancy. The original DOM remains the hit
 * tree: delegated pointer events use the same clipped bar geometry as painting.
 * No moving transparent controls participate in native layout/paint/HitTest. */
export class OverlayScrollbars {
  private cleanup: (() => void)[] = [];
  private sizes: ResizeObserver;
  private controls = new Map<HTMLElement, Controls>();
  private measurements: Measurement[] = [];
  readonly paint = new Map<HTMLElement, CanvasLayer[]>();
  private suspended = false;
  private hovered?: Controls;
  private completedPointer: number | undefined;
  private scaleX = 1;
  private scaleY = 1;
  private dragging: { controls: Controls; axis: Bar["axis"]; pointer: number; grab: number } | null = null;

  constructor(private source: HTMLElement, private changed: () => void, private scopedPaint = false) {
    this.sizes = new ResizeObserver(changed);
    const listen = (name: string, fn: EventListener) => {
      source.addEventListener(name, fn, { capture: true, passive: false });
      this.cleanup.push(() => source.removeEventListener(name, fn, true));
    };
    listen("scroll", event => {
      const controls = this.controls.get(event.target as HTMLElement);
      if (controls && !this.suspended) this.show(controls);
    });
    listen("pointerleave", event => { if (event.target === source || event.target === this.hovered?.element) this.setHovered(undefined); });
    listen("pointerdown", event => {
      const pointer = event as PointerEvent;
      this.completedPointer = undefined;
      if (pointer.button !== 0 || this.dragging) return;
      const hit = this.hit(pointer.target, pointer.clientX, pointer.clientY); if (!hit) return;
      pointer.preventDefault(); pointer.stopImmediatePropagation();
      const point = this.coordinate(pointer, hit.bar.axis), start = hit.bar.axis === "vertical" ? hit.bar.thumb.y : hit.bar.thumb.x;
      const length = hit.bar.axis === "vertical" ? hit.bar.thumb.height : hit.bar.thumb.width;
      const thumb = point >= start && point <= start + length;
      this.dragging = { controls: hit.controls, axis: hit.bar.axis, pointer: pointer.pointerId, grab: thumb ? (point-start)/length : .5 };
      this.show(hit.controls);
      source.setPointerCapture(pointer.pointerId);
      if (!thumb) this.move(point);
    });
    listen("pointermove", event => {
      const pointer = event as PointerEvent;
      if (!this.dragging) {
        if (pointer.pointerType === "mouse") this.setHovered(this.hit(pointer.target, pointer.clientX, pointer.clientY)?.controls);
        return;
      }
      if (pointer.pointerId !== this.dragging.pointer) return;
      pointer.preventDefault(); pointer.stopImmediatePropagation(); this.move(this.coordinate(pointer, this.dragging.axis));
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) listen(name, event => {
      const pointer = event as PointerEvent; if (pointer.pointerId !== this.dragging?.pointer) return;
      pointer.preventDefault(); pointer.stopImmediatePropagation();
      const underMouse = name === "pointerup" && pointer.pointerType === "mouse" ? document.elementFromPoint(pointer.clientX, pointer.clientY) : null;
      this.setHovered(underMouse ? this.hit(underMouse, pointer.clientX, pointer.clientY)?.controls : undefined);
      const controls = this.dragging.controls;
      this.finish(); this.show(controls);
      if (name === "pointerup") this.completedPointer = pointer.pointerId;
    });
    listen("keydown", () => { this.completedPointer = undefined; });
    listen("click", event => {
      const mouse = event as PointerEvent, completed = this.completedPointer;
      this.completedPointer = undefined;
      // Pointer capture retargets completion to source, including an off-track
      // release. Match its pointer rather than the release coordinates. Older
      // MouseEvent clicks lack pointerId; detail distinguishes keyboard clicks.
      const completion = completed !== undefined && (mouse.pointerId === undefined || mouse.pointerId === completed);
      if (mouse.detail > 0 && (completion || this.hit(mouse.target, mouse.clientX, mouse.clientY, true))) { mouse.preventDefault(); mouse.stopImmediatePropagation(); }
    });
    for (const name of ["touchstart", "touchmove"]) listen(name, event => {
      const touch = event as TouchEvent, point = touch.touches[0];
      if (this.dragging || point && this.hit(touch.target, point.clientX, point.clientY)) {
        touch.preventDefault(); touch.stopImmediatePropagation();
      }
    });
    try { this.sync(); } catch (error) { this.dispose(); throw error; }
  }
  private setHovered(controls?: Controls) {
    if (this.hovered === controls) return;
    const previous = this.hovered;
    this.hovered = controls;
    if (previous) this.show(previous);
    if (controls) this.show(controls);
  }
  private show(controls: Controls) {
    if (!controls.visible) { controls.visible = true; this.changed(); }
    clearTimeout(controls.timer);
    if (controls !== this.hovered && controls !== this.dragging?.controls) {
      controls.timer = window.setTimeout(() => { controls.visible = false; this.changed(); }, hideDelay);
    }
  }
  private resetVisibility(controls: Controls) {
    clearTimeout(controls.timer);
    controls.visible = false;
    if (this.hovered === controls) this.hovered = undefined;
  }
  private coordinate(event: MouseEvent, axis: Bar["axis"]) {
    const rect = this.source.getBoundingClientRect();
    return axis === "vertical" ? (event.clientY-rect.y)/this.scaleY : (event.clientX-rect.x)/this.scaleX;
  }
  private hit(target: EventTarget | null, clientX: number, clientY: number, rootClick = false) {
    if (this.suspended || !(target instanceof Node)) return;
    const rect = this.source.getBoundingClientRect(), x = (clientX-rect.x)/this.scaleX, y = (clientY-rect.y)/this.scaleY;
    const inside = (r: PaintRect) => x >= r.x && x <= r.x+r.width && y >= r.y && y <= r.y+r.height;
    let hit: { controls: Controls; bar: Bar } | undefined;
    for (const { controls, clip, bars } of this.measurements) {
      if ((!controls.element.contains(target) && !(rootClick && target === this.source)) || !inside(clip)) continue;
      const bar = bars.find(bar => inside(bar.track)); if (!bar) continue;
      if (!hit || (this.scopedPaint ? controls.element.contains(hit.controls.element) : hit.controls.element.contains(controls.element))) hit = { controls, bar };
    }
    return hit;
  }
  /** Runs before source measurements, including the first takeover frame. */
  sync(elements?: Iterable<HTMLElement>) {
    if (this.suspended) return;
    const next = new Set<HTMLElement>(this.source.matches(declaration) ? [this.source] : []);
    if (elements) for (const element of elements) next.add(element);
    else this.source.querySelectorAll<HTMLElement>(declaration).forEach(element => next.add(element));
    for (const [element, controls] of this.controls) if (!next.has(element)) this.remove(controls);
    for (const element of next) if (!this.controls.has(element)) {
      const controls: Controls = { element, visible: false, styleAbsent: !element.hasAttribute("style"),
        styles: [["scrollbar-width", "none"], ["scrollbar-gutter", "auto"]].map(([name, owned]) => ({ name, owned, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) })),
        bars: new Map() };
      this.controls.set(element, controls);
      this.sizes.observe(element);
    }
    for (const controls of this.controls.values()) for (const saved of controls.styles) {
      const style = controls.element.style;
      if (style.getPropertyValue(saved.name) === saved.owned && style.getPropertyPriority(saved.name) === "important") continue;
      saved.value = style.getPropertyValue(saved.name); saved.priority = style.getPropertyPriority(saved.name);
      style.setProperty(saved.name, saved.owned, "important");
    }
  }
  measure(origin: DOMRect, width: number, height: number, scaleX = 1, scaleY = 1): CanvasLayer[] {
    this.scaleX = scaleX; this.scaleY = scaleY;
    this.measurements = []; this.paint.clear();
    const layers: CanvasLayer[] = [];
    const bounds = new Map<HTMLElement, PaintRect>(), styles = new Map<HTMLElement, CSSStyleDeclaration>();
    const style = (element: HTMLElement) => { let value = styles.get(element); if (!value) { value = getComputedStyle(element); styles.set(element, value); } return value; };
    const viewport = (element: HTMLElement) => {
      let result = bounds.get(element);
      if (!result) {
        const r = element.getBoundingClientRect(), sx = r.width / element.offsetWidth || 1, sy = r.height / element.offsetHeight || 1;
        result = { x: (r.x - origin.x + element.clientLeft * sx) / scaleX, y: (r.y - origin.y + element.clientTop * sy) / scaleY, width: element.clientWidth * sx / scaleX, height: element.clientHeight * sy / scaleY };
        bounds.set(element, result);
      }
      return result;
    };
    for (const controls of this.controls.values()) {
      const element = controls.element, s = style(element), view = viewport(element);
      let clip = intersect(view, { x: 0, y: 0, width, height }), opacity = element === this.source ? 1 : Number(s.opacity);
      for (let parent = element.parentElement; parent && this.source.contains(parent); parent = parent.parentElement) {
        const p = style(parent);
        if (parent !== this.source) opacity *= Number(p.opacity);
        if (p.overflowX !== "visible" || p.overflowY !== "visible" || /paint|strict|content/.test(p.contain)) clip = intersect(clip, viewport(parent));
      }
      const vertical = Math.max(0, element.scrollHeight - element.clientHeight), horizontal = Math.max(0, element.scrollWidth - element.clientWidth);
      const allowX = /auto|scroll|overlay/.test(s.overflowX), allowY = /auto|scroll|overlay/.test(s.overflowY);
      const hasX = allowX && horizontal > 0, hasY = allowY && vertical > 0;
      const bars: Bar[] = [];
      if (view.width > 0 && view.height > 0 && clip.width > 0 && clip.height > 0 && s.display !== "none" && s.visibility !== "hidden") {
        const make = (axis: Bar["axis"], track: PaintRect, range: number, client: number, total: number, offset: number, rtl = false) => {
          const length = axis === "vertical" ? track.height : track.width;
          if (length <= 0) return;
          const thumbLength = Math.min(length, Math.max(Math.min(24, length / 2), length * client / total)), travel = length - thumbLength;
          const position = travel * Math.max(0, Math.min(range, offset)) / range;
          const thumb = axis === "vertical" ? { ...track, y: track.y + position, height: thumbLength } : { ...track, x: track.x + position, width: thumbLength };
          bars.push({ axis, track, thumb, range, travel, rtl });
        };
        if (hasY) make("vertical", { x: view.x + view.width - hitThickness, y: view.y, width: hitThickness, height: Math.max(0, view.height - (hasX ? hitThickness : 0)) }, vertical, element.clientHeight, element.scrollHeight, element.scrollTop);
        if (hasX) make("horizontal", { x: view.x, y: view.y + view.height - hitThickness, width: Math.max(0, view.width - (hasY ? hitThickness : 0)), height: hitThickness }, horizontal, element.clientWidth, element.scrollWidth, s.direction === "rtl" ? horizontal + element.scrollLeft : element.scrollLeft, s.direction === "rtl");
      }
      controls.bars = new Map(bars.map(bar => [bar.axis, bar]));
      if (!bars.length) { this.resetVisibility(controls); continue; }
      this.measurements.push({ controls, clip, bars });
      if (!controls.visible) continue;
      const colors = s.getPropertyValue("scrollbar-color").match(/rgba?\([^)]*\)/g) ?? [];
      const color = (value: string | undefined, fallback: number[]) => { const parts = value?.match(/[\d.]+/g)?.map(Number); return parts ? [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1] : fallback; };
      const thumbColor = color(colors[0], [0.5, 0.5, 0.5, 0.65]), trackColor = color(colors[1], [0, 0, 0, 0]);
      const painted: CanvasLayer[] = []; this.paint.set(element, painted);
      for (const bar of bars) for (const [rect, rgba] of [[bar.track, trackColor], [bar.thumb, thumbColor]] as [PaintRect, number[]][]) {
        const inset = (hitThickness - paintThickness) / 2;
        const ink = bar.axis === "vertical" ? { ...rect, x: rect.x + inset, width: paintThickness } : { ...rect, y: rect.y + inset, height: paintThickness };
        const visible = intersect(ink, clip);
        if (visible.width && visible.height && rgba[3]) { const layer: CanvasLayer = { kind: "solid", rect: visible, color: [rgba[0], rgba[1], rgba[2], rgba[3] * (this.scopedPaint ? 1 : opacity)] }; layers.push(layer); painted.push(layer); }
      }
    }
    return layers;
  }
  hide() { this.finish(); this.controls.forEach(c => this.resetVisibility(c)); this.measurements = []; this.paint.clear(); }
  private move(point: number) {
    const drag = this.dragging; if (!drag) return;
    const bar = drag.controls.bars.get(drag.axis); if (!bar || !bar.travel) return;
    const start = drag.axis === "vertical" ? bar.track.y : bar.track.x, length = drag.axis === "vertical" ? bar.thumb.height : bar.thumb.width;
    const value = Math.max(0, Math.min(bar.range, (point - start - length * drag.grab) / bar.travel * bar.range));
    if (drag.axis === "vertical") drag.controls.element.scrollTop = value; else drag.controls.element.scrollLeft = bar.rtl ? value - bar.range : value;
    this.changed();
  }
  private finish() {
    this.completedPointer = undefined;
    const drag = this.dragging; this.dragging = null;
    if (drag && this.source.hasPointerCapture(drag.pointer)) this.source.releasePointerCapture(drag.pointer);
  }
  private remove(controls: Controls) {
    if (this.dragging?.controls === controls) this.finish();
    this.resetVisibility(controls);
    this.sizes.unobserve(controls.element);
    this.restore(controls);
    this.controls.delete(controls.element);
  }
  private restore(controls: Controls) {
    for (const saved of controls.styles) {
      const style = controls.element.style;
      if (style.getPropertyValue(saved.name) !== saved.owned || style.getPropertyPriority(saved.name) !== "important") continue;
      if (saved.value) style.setProperty(saved.name, saved.value, saved.priority); else style.removeProperty(saved.name);
    }
    if (controls.styleAbsent && !controls.element.style.cssText) controls.element.removeAttribute("style");
  }
  ownsMutation(record: MutationRecord) {
    if (record.type !== "attributes" || record.attributeName !== "style") return false;
    const controls = this.controls.get(record.target as HTMLElement); if (!controls) return false;
    const before = document.createElement("span").style, after = document.createElement("span").style;
    before.cssText = record.oldValue ?? ""; after.cssText = controls.element.style.cssText;
    controls.styles.forEach(saved => { before.removeProperty(saved.name); after.removeProperty(saved.name); });
    if (before.cssText !== after.cssText) return false;
    if (!this.suspended && !controls.styles.every(saved => controls.element.style.getPropertyValue(saved.name) === saved.owned && controls.element.style.getPropertyPriority(saved.name) === "important")) this.sync(this.controls.keys());
    return true;
  }
  setSuspended(suspended: boolean) {
    this.suspended = suspended;
    if (suspended) { this.hide(); this.controls.forEach(controls => this.restore(controls)); }
  }
  dispose() {
    this.finish(); this.sizes.disconnect();
    for (const controls of this.controls.values()) this.remove(controls);
    this.cleanup.forEach(remove => remove()); this.cleanup = [];
    this.measurements = []; this.paint.clear();
  }
}
