import { CanvasLayer } from "./CanvasCompositor";
import { PaintRect } from "./CanvasPaint";
import { intersect } from "./DOMPaintTree";

const declaration = '[data-canvas-scrollbar="overlay"]';
const thickness = 8;
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
  styleAbsent: boolean;
  styles: { name: string; value: string; priority: string; owned: string }[];
  clip: HTMLDivElement;
  tracks: Map<Bar["axis"], HTMLDivElement>;
  bars: Map<Bar["axis"], Bar>;
}
interface Measurement { controls: Controls; clip: PaintRect; bars: Bar[] }

/** Explicit overlay-only extension. CSS removes native bar/gutter occupancy;
 * DOM scroll offsets remain the only scrolling state. Painted and interactive
 * tracks/thumbs share one measured geometry, outside suppressed source paint. */
export class OverlayScrollbars {
  private layer = document.createElement("div");
  private sizes: ResizeObserver;
  private controls = new Map<HTMLElement, Controls>();
  private measurements: Measurement[] = [];
  private dragging: { controls: Controls; track: HTMLElement; axis: Bar["axis"]; pointer: number; grab: number } | null = null;

  constructor(private source: HTMLElement, host: HTMLElement, private changed: () => void) {
    this.layer.className = "dom-canvas-scrollbars";
    this.layer.setAttribute("aria-hidden", "true");
    Object.assign(this.layer.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "1" });
    this.sizes = new ResizeObserver(changed);
    try {
      host.appendChild(this.layer);
      this.sync();
    } catch (error) { this.dispose(); throw error; }
  }
  /** Runs before source measurements, including the first takeover frame. */
  sync() {
    const next = new Set<HTMLElement>(this.source.matches(declaration) ? [this.source] : []);
    this.source.querySelectorAll<HTMLElement>(declaration).forEach(element => next.add(element));
    for (const [element, controls] of this.controls) if (!next.has(element)) this.remove(controls);
    for (const element of next) if (!this.controls.has(element)) {
      const clip = document.createElement("div");
      Object.assign(clip.style, { position: "absolute", overflow: "hidden", pointerEvents: "none" });
      clip.setAttribute("data-canvas-scrollbar-controls", "");
      const controls: Controls = { element, styleAbsent: !element.hasAttribute("style"),
        styles: [["scrollbar-width", "none"], ["scrollbar-gutter", "auto"]].map(([name, owned]) => ({ name, owned, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) })),
        clip, tracks: new Map(), bars: new Map() };
      this.controls.set(element, controls);
      this.sizes.observe(element); this.layer.appendChild(clip);
    }
    for (const controls of this.controls.values()) for (const saved of controls.styles) {
      const style = controls.element.style;
      if (style.getPropertyValue(saved.name) === saved.owned && style.getPropertyPriority(saved.name) === "important") continue;
      saved.value = style.getPropertyValue(saved.name); saved.priority = style.getPropertyPriority(saved.name);
      style.setProperty(saved.name, saved.owned, "important");
    }
  }
  measure(origin: DOMRect, width: number, height: number): CanvasLayer[] {
    this.measurements = [];
    const layers: CanvasLayer[] = [];
    const bounds = new Map<HTMLElement, PaintRect>(), styles = new Map<HTMLElement, CSSStyleDeclaration>();
    const style = (element: HTMLElement) => { let value = styles.get(element); if (!value) { value = getComputedStyle(element); styles.set(element, value); } return value; };
    const viewport = (element: HTMLElement) => {
      let result = bounds.get(element);
      if (!result) {
        const r = element.getBoundingClientRect(), sx = r.width / element.offsetWidth || 1, sy = r.height / element.offsetHeight || 1;
        result = { x: r.x - origin.x + element.clientLeft * sx, y: r.y - origin.y + element.clientTop * sy, width: element.clientWidth * sx, height: element.clientHeight * sy };
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
        if (hasY) make("vertical", { x: view.x + view.width - thickness, y: view.y, width: thickness, height: Math.max(0, view.height - (hasX ? thickness : 0)) }, vertical, element.clientHeight, element.scrollHeight, element.scrollTop);
        if (hasX) make("horizontal", { x: view.x, y: view.y + view.height - thickness, width: Math.max(0, view.width - (hasY ? thickness : 0)), height: thickness }, horizontal, element.clientWidth, element.scrollWidth, s.direction === "rtl" ? horizontal + element.scrollLeft : element.scrollLeft, s.direction === "rtl");
      }
      const colors = s.getPropertyValue("scrollbar-color").match(/rgba?\([^)]*\)/g) ?? [];
      const color = (value: string | undefined, fallback: number[]) => { const parts = value?.match(/[\d.]+/g)?.map(Number); return parts ? [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1] : fallback; };
      const thumbColor = color(colors[0], [0.5, 0.5, 0.5, 0.65]), trackColor = color(colors[1], [0, 0, 0, 0]);
      this.measurements.push({ controls, clip, bars });
      for (const bar of bars) for (const [rect, rgba] of [[bar.track, trackColor], [bar.thumb, thumbColor]] as [PaintRect, number[]][]) {
        const visible = intersect(rect, clip);
        if (visible.width && visible.height && rgba[3]) layers.push({ kind: "solid", rect: visible, color: [rgba[0], rgba[1], rgba[2], rgba[3] * opacity] });
      }
    }
    return layers;
  }
  hide() { this.finish(); this.layer.style.display = "none"; }
  /** Called only after the matching Canvas frame succeeds. No geometry reads. */
  commit(left: number, top: number, width: number, height: number) {
    Object.assign(this.layer.style, { display: "block", left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    for (const { controls, clip, bars } of this.measurements) {
      Object.assign(controls.clip.style, { left: `${clip.x}px`, top: `${clip.y}px`, width: `${clip.width}px`, height: `${clip.height}px` });
      controls.bars = new Map(bars.map(bar => [bar.axis, bar]));
      for (const [axis, track] of controls.tracks) if (!controls.bars.has(axis)) { if (this.dragging?.track === track) this.finish(); track.remove(); controls.tracks.delete(axis); }
      for (const bar of bars) {
        let track = controls.tracks.get(bar.axis);
        if (!track) { track = this.createTrack(controls, bar.axis); controls.tracks.set(bar.axis, track); controls.clip.appendChild(track); }
        Object.assign(track.style, { left: `${bar.track.x - clip.x}px`, top: `${bar.track.y - clip.y}px`, width: `${bar.track.width}px`, height: `${bar.track.height}px` });
        const thumb = track.firstElementChild as HTMLElement;
        Object.assign(thumb.style, { left: `${bar.thumb.x - bar.track.x}px`, top: `${bar.thumb.y - bar.track.y}px`, width: `${bar.thumb.width}px`, height: `${bar.thumb.height}px` });
      }
    }
  }
  private createTrack(controls: Controls, axis: Bar["axis"]) {
    const track = document.createElement("div"), thumb = document.createElement("div");
    track.setAttribute("data-canvas-scrollbar-axis", axis); thumb.setAttribute("data-canvas-scrollbar-thumb", "");
    Object.assign(track.style, { position: "absolute", pointerEvents: "auto", touchAction: "none", userSelect: "none" });
    Object.assign(thumb.style, { position: "absolute" }); track.appendChild(thumb);
    const coordinate = (event: PointerEvent) => { const r = this.source.getBoundingClientRect(); return axis === "vertical" ? event.clientY - r.y : event.clientX - r.x; };
    track.addEventListener("pointerdown", event => {
      if (event.button !== 0 || this.dragging) return;
      const bar = controls.bars.get(axis); if (!bar) return;
      event.preventDefault(); event.stopPropagation();
      const point = coordinate(event), start = axis === "vertical" ? bar.thumb.y : bar.thumb.x, length = axis === "vertical" ? bar.thumb.height : bar.thumb.width;
      const grab = event.target === thumb ? Math.max(0, Math.min(1, (point - start) / length)) : 0.5;
      this.dragging = { controls, track, axis, pointer: event.pointerId, grab };
      track.setPointerCapture(event.pointerId);
      if (event.target !== thumb) this.move(point);
    });
    track.addEventListener("pointermove", event => { if (this.dragging?.pointer !== event.pointerId) return; event.preventDefault(); event.stopPropagation(); this.move(coordinate(event)); });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) track.addEventListener(name, event => { if (this.dragging?.pointer !== (event as PointerEvent).pointerId) return; event.preventDefault(); event.stopPropagation(); this.finish(); });
    track.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
    track.addEventListener("wheel", event => {
      event.preventDefault(); event.stopPropagation();
      const line = parseFloat(getComputedStyle(controls.element).lineHeight) || 16, multiplier = event.deltaMode === 1 ? line : event.deltaMode === 2 ? controls.element.clientHeight : 1;
      controls.element.scrollTop += event.shiftKey ? 0 : event.deltaY * multiplier;
      controls.element.scrollLeft += (event.deltaX || (event.shiftKey ? event.deltaY : 0)) * multiplier;
      this.changed();
    }, { passive: false });
    return track;
  }
  private move(point: number) {
    const drag = this.dragging; if (!drag) return;
    const bar = drag.controls.bars.get(drag.axis); if (!bar || !bar.travel) return;
    const start = drag.axis === "vertical" ? bar.track.y : bar.track.x, length = drag.axis === "vertical" ? bar.thumb.height : bar.thumb.width;
    const value = Math.max(0, Math.min(bar.range, (point - start - length * drag.grab) / bar.travel * bar.range));
    if (drag.axis === "vertical") drag.controls.element.scrollTop = value; else drag.controls.element.scrollLeft = bar.rtl ? value - bar.range : value;
    this.changed();
  }
  private finish() {
    const drag = this.dragging; this.dragging = null;
    if (drag?.track.hasPointerCapture(drag.pointer)) drag.track.releasePointerCapture(drag.pointer);
  }
  private remove(controls: Controls) {
    if (this.dragging?.controls === controls) this.finish();
    this.sizes.unobserve(controls.element); controls.clip.remove();
    for (const saved of controls.styles) {
      const style = controls.element.style;
      if (style.getPropertyValue(saved.name) !== saved.owned || style.getPropertyPriority(saved.name) !== "important") continue;
      if (saved.value) style.setProperty(saved.name, saved.value, saved.priority); else style.removeProperty(saved.name);
    }
    if (controls.styleAbsent && !controls.element.style.cssText) controls.element.removeAttribute("style");
    this.controls.delete(controls.element);
  }
  dispose() {
    this.finish(); this.sizes.disconnect();
    for (const controls of this.controls.values()) this.remove(controls);
    this.layer.remove(); this.measurements = [];
  }
}
