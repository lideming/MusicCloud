import { PaintRect } from "./CanvasPaint";

export interface PaintUnit { id: string; element: HTMLElement; ownOnly: boolean }
interface PaintBranch {
  element: HTMLElement; parent?: PaintBranch; index: number; children: PaintBranch[]; unit?: PaintUnit; active: boolean;
  text: boolean; split: boolean; boundary: boolean; boundaryCount: number; atomic: boolean; small: boolean; visible: boolean; pixels: boolean;
  vertical: boolean; flow: boolean; safeFlow: boolean; bounded: boolean; clips: boolean;
  unsafeChildren: number; flowChildren: PaintBranch[]; escaping: Set<PaintBranch>;
}
export interface PaintOrder { kind: "unit" | "effect" | "begin" | "end"; element: HTMLElement; unit?: PaintUnit; opacity?: number }

export function createsContext(style: CSSStyleDeclaration, parentDisplay = "") {
  return style.position === "fixed" || style.position === "sticky" ||
    (style.zIndex !== "auto" && (style.position !== "static" || /^(inline-)?(flex|grid)$/.test(parentDisplay))) ||
    style.transform !== "none" || Number(style.opacity) < 1 || style.isolation === "isolate" ||
    /paint|layout|strict|content/.test(style.contain) || style.filter !== "none";
}
function transparent(color: string) { return color === "transparent" || /rgba\([^)]*,\s*0\s*\)/.test(color); }
function ownsPixels(element: HTMLElement, style: CSSStyleDeclaration, text: boolean) {
  return style.backgroundImage !== "none" || style.backdropFilter !== "none" || !transparent(style.backgroundColor) || style.boxShadow !== "none" || style.outlineStyle !== "none" ||
    ["top", "right", "bottom", "left"].some(side => parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 && !transparent(style.getPropertyValue(`border-${side}-color`))) ||
    text ||
    element instanceof HTMLImageElement || element instanceof HTMLVideoElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element instanceof HTMLCanvasElement || element instanceof SVGSVGElement ||
    ["::before", "::after"].some(pseudo => { const s = getComputedStyle(element, pseudo); return s.content !== "none" && s.content !== "normal"; });
}

/** Structural/sibling selectors can restyle untouched sibling subtrees.
 * Without them, child-list edits can retain those nodes. Inaccessible sheets
 * conservatively keep the subtree refresh path. This is a CSS capability gate,
 * not a selector dependency graph or an application-specific grouping rule. */
function hasStructuralSelectors() {
  const seen = new Set<CSSStyleSheet>();
  const rules = (list: CSSRuleList): boolean => Array.from(list).some(rule => {
    const item = rule as CSSRule & { selectorText?: string; cssRules?: CSSRuleList; styleSheet?: CSSStyleSheet };
    return !!item.selectorText && /:(?:nth-|first-|last-|only-|empty|has\()|[+~]/.test(item.selectorText) ||
      !!item.cssRules && rules(item.cssRules) || !!item.styleSheet && sheet(item.styleSheet);
  });
  const sheet = (style: CSSStyleSheet): boolean => {
    if (seen.has(style)) return false; seen.add(style);
    try { return rules(style.cssRules); } catch { return true; }
  };
  return Array.from(document.styleSheets).some(sheet);
}

/** A DOM hierarchy, not a second layout model. Boundary summaries make local
 * changes independent of the number of other resources. Live native rectangles
 * select candidates; only CSS-contained ordinary vertical flow is searched. */
export class DOMPaintTree {
  readonly byElement = new Map<HTMLElement, PaintUnit>();
  readonly members = new Set<HTMLElement>();
  readonly scrollers = new Set<HTMLElement>();
  private nodes = new Map<HTMLElement, PaintBranch>();
  private ids = new WeakMap<HTMLElement, string>();
  private nextId = 0;
  private root: PaintBranch;
  get units() { return Array.from(this.byElement.values()); }
  constructor(readonly source: HTMLElement, private selectedSources: Set<Element>) {
    this.root = this.build(source);
    this.activate(this.root, true);
  }
  private read(branch: PaintBranch) {
    const element = branch.element, style = getComputedStyle(element);
    const contained = /paint|strict|content/.test(style.contain);
    const scroller = /(auto|scroll)/.test(style.overflowY) || /(auto|scroll)/.test(style.overflowX);
    if (scroller && !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) this.scrollers.add(element); else this.scrollers.delete(element);
    branch.visible = style.display !== "none" && style.visibility !== "hidden";
    branch.split = element.getAttribute("data-canvas-scrollbar") === "overlay" || scroller && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth);
    const matrix = style.transform === "none" ? null : new DOMMatrixReadOnly(style.transform);
    const transformed = matrix && (!matrix.is2D || Math.abs(matrix.a-1) > 1e-7 || Math.abs(matrix.d-1) > 1e-7 || Math.abs(matrix.b) > 1e-7 || Math.abs(matrix.c) > 1e-7);
    branch.boundary = !!transformed || style.backdropFilter !== "none" || element instanceof HTMLVideoElement || element instanceof HTMLCanvasElement || style.animationName !== "none" || style.position === "sticky" || style.position === "fixed" ||
      element.hasAttribute("data-canvas-blur") || this.selectedSources.has(element) ||
      // A real nested scroll viewport must not bake its scrolling children into
      // a parent surface, whether or not overlay chrome is requested.
      branch.split ||
      createsContext(style, element.parentElement ? getComputedStyle(element.parentElement).display : "") && style.zIndex !== "auto" && style.zIndex !== "0";
    branch.pixels = branch.visible && ownsPixels(element, style, branch.text);
    branch.vertical = style.writingMode === "horizontal-tb" && (/^(block|flow-root|list-item)$/.test(style.display) ||
      style.display === "flex" && style.flexDirection === "column" && style.flexWrap === "nowrap") &&
      (style.columnCount === "auto" || style.columnCount === "1") && style.columnWidth === "auto";
    branch.flow = style.position !== "absolute" && style.position !== "fixed" && style.display !== "none";
    branch.safeFlow = !branch.flow || /^(block|flow-root|list-item|flex|grid|table)$/.test(style.display) && style.float === "none" && Number(style.order) === 0 &&
      parseFloat(style.marginTop) >= 0 && parseFloat(style.marginBottom) >= 0;
    const unmoved = style.position === "static" || style.position === "relative" && [style.top, style.bottom].every(v => v === "auto" || parseFloat(v) === 0);
    branch.clips = contained || style.overflowY !== "visible";
    // Overflow on a static box does not contain abspos descendants whose
    // containing block lies outside it. Paint containment, or a positioned
    // clipping box, provides the required bound.
    branch.bounded = (contained || branch.clips && style.position === "relative") && unmoved && style.transform === "none" &&
      style.filter === "none" && parseFloat(style.overflowClipMargin) === 0 && style.boxShadow === "none" && style.outlineStyle === "none";
  }
  private summarize(branch: PaintBranch) {
    branch.small = branch.element.offsetHeight <= Math.max(128, this.source.clientHeight / 2);
    branch.atomic = branch.element instanceof SVGSVGElement || branch.element instanceof HTMLImageElement || branch.element instanceof HTMLVideoElement || branch.element instanceof HTMLInputElement || branch.element instanceof HTMLTextAreaElement || branch.element instanceof HTMLSelectElement || branch.element instanceof HTMLCanvasElement ||
      branch.element !== this.source && !branch.split && branch.small && branch.boundaryCount === 0;
  }
  private indexChildren(branch: PaintBranch) {
    branch.children.forEach((child, index) => child.index = index);
    branch.flowChildren = branch.children.filter(child => child.flow && child.bounded);
    branch.escaping = new Set(branch.children.filter(child => !child.flow || !child.bounded));
  }
  private updateChildIndex(parent: PaintBranch, child: PaintBranch) {
    const children = parent.flowChildren;
    let low = 0, high = children.length;
    while (low < high) { const middle = (low + high) >>> 1; if (children[middle].index < child.index) low = middle + 1; else high = middle; }
    const included = child.flow && child.bounded;
    if (included && children[low] !== child) children.splice(low, 0, child);
    else if (!included && children[low] === child) children.splice(low, 1);
    if (included) parent.escaping.delete(child); else parent.escaping.add(child);
  }
  private build(element: HTMLElement, parent?: PaintBranch): PaintBranch {
    const branch: PaintBranch = { element, parent, index: 0, children: [], active: false, text: Array.from(element.childNodes).some(child => child instanceof Text && !!child.textContent?.trim()), split: false, boundary: false, boundaryCount: 0, atomic: false, small: false, visible: false, pixels: false,
      vertical: false, flow: false, safeFlow: false, bounded: false, clips: false, unsafeChildren: 0, flowChildren: [], escaping: new Set() };
    this.nodes.set(element, branch);
    this.read(branch);
    // SVG descendants are painted through SVG image serialization, not HTML
    // resources. Their changes still find their enclosing SVG via ancestors.
    if (!(element instanceof SVGSVGElement) && !(element instanceof HTMLImageElement) && !(element instanceof HTMLVideoElement) && !(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement) && !(element instanceof HTMLSelectElement) && !(element instanceof HTMLCanvasElement)) {
      branch.children = Array.from(element.children).filter(child => !child.hasAttribute("data-canvas-owned")).map(child => this.build(child as HTMLElement, branch));
    }
    branch.boundaryCount = branch.children.reduce((n, child) => n + Number(child.boundary) + child.boundaryCount, 0);
    branch.unsafeChildren = branch.children.reduce((n, child) => n + Number(!child.safeFlow), 0);
    this.indexChildren(branch); this.summarize(branch);
    return branch;
  }
  private activate(branch: PaintBranch, active: boolean) {
    active = active && branch.visible;
    const wasActive = branch.active, wasAtomic = branch.unit && !branch.unit.ownOnly;
    branch.active = active;
    if (active && (branch.atomic || branch.pixels)) {
      let id = this.ids.get(branch.element);
      if (!id) { id = `paint-${this.nextId++}`; this.ids.set(branch.element, id); }
      branch.unit = { id, element: branch.element, ownOnly: !branch.atomic };
      this.byElement.set(branch.element, branch.unit); this.members.add(branch.element);
    } else {
      branch.unit = undefined; this.byElement.delete(branch.element); this.members.delete(branch.element);
    }
    if (wasActive !== active || !!wasAtomic !== branch.atomic) branch.children.forEach(child => this.activate(child, active && !branch.atomic));
  }
  private remove(branch: PaintBranch) {
    this.nodes.delete(branch.element); this.scrollers.delete(branch.element); this.byElement.delete(branch.element); this.members.delete(branch.element);
    branch.children.forEach(child => this.remove(child));
  }
  /** Content/CSS/child-list changes re-read their DOM subtree, including
   * structural selectors and inherited styles there. Size and direct text
   * changes only need the box and the cached descendant-boundary summary. */
  refresh(element: Element, shallow = false, childrenOnly = false) {
    let current: Element | null = element;
    while (current && !this.nodes.has(current as HTMLElement)) current = current.parentElement;
    if (!current) return;
    const branch = this.nodes.get(current as HTMLElement)!;
    const parent = branch.parent;
    const oldCount = Number(branch.boundary) + branch.boundaryCount, oldSafe = branch.safeFlow, oldFlow = branch.flow, oldBounded = branch.bounded;
    if (branch.element instanceof SVGSVGElement || branch.element instanceof HTMLCanvasElement || branch.element instanceof HTMLVideoElement || branch.element instanceof HTMLInputElement || branch.element instanceof HTMLTextAreaElement || branch.element instanceof HTMLSelectElement) childrenOnly = false;
    if (childrenOnly && !hasStructuralSelectors()) {
      const children = new Set(Array.from(branch.element.children).filter(child => !child.hasAttribute("data-canvas-owned")) as HTMLElement[]);
      for (const child of branch.children) if (!children.has(child.element) && child.parent === branch) this.remove(child);
      branch.children = Array.from(children).map(child => this.nodes.get(child) ?? this.build(child, branch));
      branch.children.forEach(child => { child.parent = branch; this.activate(child, branch.active && !branch.atomic); });
      branch.boundaryCount = branch.children.reduce((count, child) => count + Number(child.boundary) + child.boundaryCount, 0);
      branch.unsafeChildren = branch.children.reduce((count, child) => count + Number(!child.safeFlow), 0);
      this.indexChildren(branch); shallow = true;
    }
    if (shallow) {
      branch.text = Array.from(branch.element.childNodes).some(child => child instanceof Text && !!child.textContent?.trim());
      this.read(branch); this.summarize(branch); this.activate(branch, branch.active || !parent);
    } else {
      const active = branch.active || !parent, index = branch.index;
      this.remove(branch); const rebuilt = this.build(branch.element, parent);
      Object.assign(branch, rebuilt, { index }); this.nodes.set(branch.element, branch);
      branch.children.forEach(child => child.parent = branch);
      this.activate(branch, active);
    }
    let countDelta = Number(branch.boundary) + branch.boundaryCount - oldCount;
    let safeDelta = Number(!branch.safeFlow) - Number(!oldSafe);
    let indexChanged = branch.flow !== oldFlow || branch.bounded !== oldBounded;
    let changedChild = branch;
    for (let ancestor = parent; ancestor; ancestor = ancestor.parent) {
      const beforeCount = Number(ancestor.boundary) + ancestor.boundaryCount, beforeSafe = ancestor.safeFlow, beforeFlow = ancestor.flow, beforeBounded = ancestor.bounded;
      ancestor.boundaryCount += countDelta; ancestor.unsafeChildren += safeDelta;
      if (indexChanged) this.updateChildIndex(ancestor, changedChild);
      this.read(ancestor); this.summarize(ancestor); this.activate(ancestor, ancestor.active || !ancestor.parent);
      countDelta = Number(ancestor.boundary) + ancestor.boundaryCount - beforeCount;
      safeDelta = Number(!ancestor.safeFlow) - Number(!beforeSafe);
      indexChanged = ancestor.flow !== beforeFlow || ancestor.bounded !== beforeBounded;
      changedChild = ancestor;
    }
  }
  updateSources(selected: Set<Element>) {
    const changed = new Set([...this.selectedSources, ...selected]);
    const previous = this.selectedSources; this.selectedSources = selected;
    for (const element of changed) if (previous.has(element) !== selected.has(element) && this.source.contains(element)) this.refresh(element, true);
  }
  /** Candidate work follows native clipping hierarchy. Monotone block/column
   * flow with nonnegative margins admits a binary search of live DOM boxes.
   * Uncontained, positioned, sticky/transformed and other escaping branches are
   * always visited; grids, reordered flex, floats and negative margins fall back
   * to their ordinary hierarchy. No row heights or scroll offsets are cached. */
  nearby(viewport: PaintRect, margin = 128): Set<HTMLElement> {
    const result = new Set<HTMLElement>();
    const overlaps = (r: DOMRect, v: PaintRect) => r.bottom >= v.y && r.top <= v.y + v.height && r.right >= v.x && r.left <= v.x + v.width;
    const visit = (branch: PaintBranch, clip: PaintRect) => {
      if (!branch.active) return;
      const r = branch.element.getBoundingClientRect();
      if (overlaps(r, clip) && branch.small !== (branch.element.offsetHeight <= Math.max(128, this.source.clientHeight / 2))) this.refresh(branch.element, true);
      if (branch.unit && overlaps(r, clip)) result.add(branch.element);
      if (branch.atomic) return;
      if (branch.clips && branch.element !== this.source) {
        clip = intersect(clip, { x: r.x, y: r.y - margin, width: r.width, height: r.height + margin * 2 });
        if (!clip.width || !clip.height) return;
      }
      if (!branch.vertical || branch.unsafeChildren) { branch.children.forEach(child => visit(child, clip)); return; }
      const children = branch.flowChildren;
      let low = 0, high = children.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (children[middle].element.getBoundingClientRect().bottom < clip.y) low = middle + 1; else high = middle;
      }
      for (let i = low; i < children.length; i++) {
        if (children[i].element.getBoundingClientRect().top > clip.y + clip.height) break;
        visit(children[i], clip);
      }
      branch.escaping.forEach(child => visit(child, clip));
    };
    visit(this.root, viewport);
    return result;
  }
  /** Stacking contexts are atomic to their parent. Only active ancestry is
   * traversed, including the direct children needed by the current viewport. */
  order(styles: Map<HTMLElement, CSSStyleDeclaration>, active: Set<HTMLElement>): PaintOrder[] {
    const result: PaintOrder[] = [];
    const children = new Map<PaintBranch, Set<PaintBranch>>();
    for (const element of styles.keys()) {
      const branch = this.nodes.get(element);
      if (branch?.parent) {
        let selected = children.get(branch.parent);
        if (!selected) children.set(branch.parent, selected = new Set());
        selected.add(branch);
      }
    }
    const descendants = (branch: PaintBranch) => Array.from(children.get(branch) ?? []).sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
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
      const scopes = new Map<PaintBranch, PaintBranch[]>();
      const collect = (child: PaintBranch, flow: PaintBranch[]) => {
        const s = style(child);
        if (isContext(child)) { contexts.push(child); return; }
        if (s.position !== "static") { positioned.push(child); flow = []; scopes.set(child, flow); }
        else flow.push(child);
        descendants(child).forEach(descendant => collect(descendant, flow));
      };
      descendants(branch).forEach(child => collect(child, normal));
      const z = (b: PaintBranch) => Number(style(b).zIndex) || 0;
      contexts.filter(b => z(b) < 0).sort((a, b) => z(a) - z(b)).forEach(context);
      normal.forEach(own);
      [...positioned, ...contexts.filter(b => z(b) === 0)].sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1).forEach(b => {
        if (isContext(b)) context(b); else { own(b); scopes.get(b)!.forEach(own); }
      });
      contexts.filter(b => z(b) > 0).sort((a, b) => z(a) - z(b)).forEach(context);
      if (isolated) result.push({ kind: "end", element: branch.element });
    };
    context(this.root);
    return result;
  }
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
