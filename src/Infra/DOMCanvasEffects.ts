import { CanvasLayer } from "./CanvasCompositor";
import { PaintRect } from "./CanvasPaint";
import { PaintUnit } from "./DOMPaintTree";

/** Renderer-only extension: data-canvas-blur contains selectors scoped to the
 * source root. Ordinary CSS still owns foreground/tint, geometry and stacking.
 * The host's external DOM material is outside this selection and never read. */
export class DOMCanvasEffects {
  readonly selectedSources = new Set<Element>();
  private sources = new Map<HTMLElement, Element[]>();
  constructor(root: HTMLElement) {
    for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-canvas-blur]"))) {
      const selected = Array.from(root.querySelectorAll(element.getAttribute("data-canvas-blur") || ":scope"));
      this.sources.set(element, selected);
      selected.forEach(source => this.selectedSources.add(source));
    }
  }
  get elements() { return Array.from(this.sources.keys()); }
  layer(element: HTMLElement, units: PaintUnit[], rect: PaintRect): CanvasLayer {
    const selected = this.sources.get(element)!;
    return { kind: "blur", rect,
      sources: units.filter(unit => selected.some(source => source === unit.element || source.contains(unit.element))).reduce<string[]>((ids, unit) => [...ids, unit.id + "/shadow", unit.id], []) };
  }
}
