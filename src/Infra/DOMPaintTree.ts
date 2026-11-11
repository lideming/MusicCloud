import { PaintRect } from "./CanvasPaint";

export interface PaintUnit { id: string; element: HTMLElement; ownOnly: boolean }
interface PaintBranch { element: HTMLElement; unit?: PaintUnit; children: PaintBranch[] }
export interface PaintOrder { kind: "unit" | "effect" | "begin" | "end"; element: HTMLElement; unit?: PaintUnit; opacity?: number }

export function createsContext(style: CSSStyleDeclaration, parentDisplay = "") {
  return style.position === "fixed" || style.position === "sticky" ||
    (style.zIndex !== "auto" && (style.position !== "static" || /^(inline-)?(flex|grid)$/.test(parentDisplay))) ||
    style.transform !== "none" || Number(style.opacity) < 1 || style.isolation === "isolate" ||
    /paint|layout|strict|content/.test(style.contain) || style.filter !== "none";
}
function transparent(color: string) { return color === "transparent" || /rgba\([^)]*,\s*0\s*\)/.test(color); }
function ownsPixels(element: HTMLElement, style: CSSStyleDeclaration) {
  return !transparent(style.backgroundColor) || style.boxShadow !== "none" || style.outlineStyle !== "none" ||
    ["top", "right", "bottom", "left"].some(side => parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 && !transparent(style.getPropertyValue(`border-${side}-color`))) ||
    Array.from(element.childNodes).some(child => child instanceof Text && !!child.textContent?.trim()) ||
    element instanceof HTMLImageElement || element instanceof SVGSVGElement ||
    ["::before", "::after"].some(pseudo => { const s = getComputedStyle(element, pseudo); return s.content !== "none" && s.content !== "normal"; });
}

/** CSS/layout-derived resource boundaries. Small unfragmented subtrees reuse a
 * surface; large containers, sticky boxes and explicit effect/source boundaries
 * stay separate. Neither tag names nor application roles select these groups. */
export class DOMPaintTree {
  readonly units: PaintUnit[] = [];
  readonly byElement = new Map<HTMLElement, PaintUnit>();
  private root: PaintBranch;
  constructor(readonly source: HTMLElement, selectedSources: Set<Element>) {
    let nextId = 0;
    const boundary = (element: Element) => {
      const style = getComputedStyle(element);
      return style.position === "sticky" || style.position === "fixed" ||
        element.hasAttribute("data-canvas-blur") || selectedSources.has(element) ||
        (createsContext(style, element.parentElement ? getComputedStyle(element.parentElement).display : "") && style.zIndex !== "auto" && style.zIndex !== "0");
    };
    const walk = (element: HTMLElement, root = false): PaintBranch => {
      const style = getComputedStyle(element);
      const branch: PaintBranch = { element, children: [] };
      if (style.display === "none" || style.visibility === "hidden") return branch;
      const descendants = Array.from(element.querySelectorAll<HTMLElement>("*"));
      const atomic = element instanceof SVGSVGElement || element instanceof HTMLImageElement || !root && element.offsetHeight <= Math.max(128, source.clientHeight / 2) &&
        !descendants.some(boundary);
      if (atomic || ownsPixels(element, style)) {
        branch.unit = { id: `paint-${nextId++}`, element, ownOnly: !atomic };
        this.units.push(branch.unit); this.byElement.set(element, branch.unit);
      }
      if (!atomic) branch.children = Array.from(element.children).map(child => walk(child as HTMLElement));
      return branch;
    };
    this.root = walk(source, true);
  }
  /** Stacking contexts are atomic to their parent. Positioned descendants of
   * non-context ancestors join the nearest real context, never a global z sort.
   * Covers the block/flex/positioned CSS subset used by these DOM surfaces. */
  order(styles: Map<HTMLElement, CSSStyleDeclaration>, active: Set<HTMLElement>): PaintOrder[] {
    const result: PaintOrder[] = [];
    const style = (branch: PaintBranch) => styles.get(branch.element)!;
    const isContext = (branch: PaintBranch) => createsContext(style(branch), styles.get(branch.element.parentElement!)?.display ?? "");
    const own = (branch: PaintBranch) => {
      if (branch.element.hasAttribute("data-canvas-blur")) result.push({ kind: "effect", element: branch.element });
      if (branch.unit && active.has(branch.element)) result.push({ kind: "unit", element: branch.element, unit: branch.unit });
    };
    const context = (branch: PaintBranch) => {
      const opacity = Number(style(branch).opacity), isolated = branch.element !== this.source && opacity < 1;
      if (isolated) result.push({ kind: "begin", element: branch.element, opacity });
      own(branch);
      const normal: PaintBranch[] = [], positioned: PaintBranch[] = [], contexts: PaintBranch[] = [];
      const collect = (child: PaintBranch) => {
        if (!styles.has(child.element)) return;
        const s = style(child);
        if (isContext(child)) { contexts.push(child); return; }
        if (s.position !== "static") positioned.push(child); else normal.push(child);
        child.children.forEach(collect);
      };
      branch.children.forEach(collect);
      const z = (b: PaintBranch) => Number(style(b).zIndex) || 0;
      contexts.filter(b => z(b) < 0).sort((a, b) => z(a) - z(b)).forEach(context);
      normal.forEach(own);
      // Both collections were collected in preorder; compareDocumentPosition
      // merges their zero-level entries without changing local context nesting.
      [...positioned, ...contexts.filter(b => z(b) === 0)].sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1).forEach(b => isContext(b) ? context(b) : own(b));
      contexts.filter(b => z(b) > 0).sort((a, b) => z(a) - z(b)).forEach(context);
      if (isolated) result.push({ kind: "end", element: branch.element });
    };
    context(this.root);
    return result;
  }
  /** Only active resource ancestors need computed style/clip reads on scroll. */
  ancestors(elements: Set<HTMLElement>) {
    const result = new Set<HTMLElement>([this.source]);
    for (const element of elements) for (let node: HTMLElement | null = element; node && this.source.contains(node); node = node.parentElement) result.add(node);
    return result;
  }
}

export function intersect(a: PaintRect, b: PaintRect): PaintRect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}
