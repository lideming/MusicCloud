import { DOMTextEditing, TextSelectionPaint, isTextControl } from "./DOMTextEditing";
import { boxOrigin, isAxisAligned, localRect, readBasis } from "./DOMPaintGeometry";
// A small paint vocabulary for DOM-laid-out controls, not a CSS layout engine.
// All DOM reads finish before Canvas2D or WebGL drawing starts.
export interface PaintRect { x: number; y: number; width: number; height: number }
export interface PaintClip { rect: PaintRect; radii: { x: number; y: number }[] }

/** The overflow clip follows the padding edge, with the border's inner radii.
 * Resolve percentages against the border box before normalizing adjacent arcs. */
export function readOverflowClip(style: CSSStyleDeclaration, rect: PaintRect, layoutWidth = rect.width, layoutHeight = rect.height): PaintClip {
  const sx = rect.width / layoutWidth || 1, sy = rect.height / layoutHeight || 1;
  const borders = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(v => parseFloat(v) || 0);
  const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(value => {
    const parts = value.split(/\s+/), length = (v: string, basis: number) => v.endsWith("%") ? parseFloat(v) * basis / 100 : parseFloat(v) || 0;
    return { x: length(parts[0], layoutWidth), y: length(parts[1] || parts[0], layoutHeight) };
  });
  const ratio = (size: number, sum: number) => sum ? size / sum : 1;
  const factor = Math.min(1, ratio(layoutWidth, radii[0].x + radii[1].x), ratio(layoutWidth, radii[3].x + radii[2].x),
    ratio(layoutHeight, radii[0].y + radii[3].y), ratio(layoutHeight, radii[1].y + radii[2].y));
  return { rect: { x: rect.x + borders[3] * sx, y: rect.y + borders[0] * sy,
    width: Math.max(0, rect.width - (borders[1] + borders[3]) * sx), height: Math.max(0, rect.height - (borders[0] + borders[2]) * sy) },
    radii: radii.map((r, i) => ({ x: Math.max(0, r.x * factor - borders[i === 0 || i === 3 ? 3 : 1]) * sx,
      y: Math.max(0, r.y * factor - borders[i < 2 ? 0 : 2]) * sy })) };
}
interface PaintBox {
  rect: PaintRect;
  background: string;
  backgroundImage?: PaintImage;
  borders: { color: string; width: number }[];
  radii: number[];
  opacity: number;
  clip: boolean;
  clipShape?: PaintClip;
  outline: string;
  outlineWidth: number;
  outlineOffset: number;
  children: PaintNode[];
}
interface PaintText { rect: PaintRect; text: string; font: string; color: string; size: number; direction: CanvasDirection;
  selection?: TextSelectionPaint; opacity?: number; decoration?: { color: string; width: number }; shadow?: PaintSnapshot["shadow"] }
interface PaintImage { rect: PaintRect; image: CanvasImageSource }
interface PaintFill { rect: PaintRect; fill: string }
type PaintNode = PaintBox | PaintText | PaintImage | PaintFill;
export interface PaintSnapshot {
  width: number; height: number; layoutWidth: number; layoutHeight: number;
  offsetX: number; offsetY: number; root: PaintBox;
  imageUrls: string[];
  videos?: HTMLVideoElement[];
  filter?: string;
  shadow?: { color: string; x: number; y: number; blur: number; spread: number };
}

export function readBoxShadow(value: string): PaintSnapshot["shadow"] {
  const lengths = value.match(/-?[\d.]+px/g)?.map(parseFloat), color = value.match(/rgba?\([^)]*\)/)?.[0];
  return lengths && color ? { color, x: lengths[0], y: lengths[1], blur: lengths[2] || 0, spread: lengths[3] || 0 } : undefined;
}

export class PaintImages {
  private images = new Map<string, HTMLImageElement>();
  constructor(private changed: (url: string) => void, private failed: (error: Error) => void) {}
  get(url: string) {
    let image = this.images.get(url);
    if (!image) {
      image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => this.changed(url);
      image.onerror = () => this.failed(new Error("Canvas paint image failed to load"));
      image.src = url;
      this.images.set(url, image);
    }
    return image.complete && image.naturalWidth ? image : null;
  }
  get size() { return this.images.size; }
  retain(urls: Set<string>) {
    for (const [url, image] of this.images) if (!urls.has(url)) {
      image.onload = image.onerror = null;
      this.images.delete(url);
    }
  }
  dispose() {
    for (const image of this.images.values()) image.onload = image.onerror = null;
    this.images.clear();
  }
}

function svgImage(element: SVGSVGElement, rootOpacityInPlacement: boolean) {
  const clone = element.cloneNode(true) as SVGSVGElement;
  const originals = [element, ...Array.from(element.querySelectorAll("*"))];
  const copies = [clone, ...Array.from(clone.querySelectorAll("*"))];
  originals.forEach((node, i) => {
    const style = getComputedStyle(node);
    for (const key of ["color", "fill", "stroke", "stroke-width", "fill-opacity", "stroke-opacity", "opacity"]) {
      (copies[i] as SVGElement).style.setProperty(key, key === "opacity" && i === 0 && rootOpacityInPlacement ? "1" : style.getPropertyValue(key));
    }
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
}

/** Fractional, untransformed border-box dimensions. offsetWidth/Height round
 * layout pixels, which would turn ordinary fractional layout into a scale. */
export function readPaintSize(element: HTMLElement, style = getComputedStyle(element)) {
  const borderBox = (axis: "width" | "height", sides: string[], fallback: number) => {
    const size = parseFloat(style[axis]);
    if (!Number.isFinite(size)) return fallback;
    return size + (style.boxSizing === "border-box" ? 0 : sides.reduce((sum, side) => sum +
      (parseFloat(style.getPropertyValue(`padding-${side}`)) || 0) + (parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0), 0));
  };
  return { width: borderBox("width", ["left", "right"], element.offsetWidth), height: borderBox("height", ["top", "bottom"], element.offsetHeight) };
}

/** Coordinates are normalized to the untransformed resource; row scale/opacity
 * belongs to compositor placement, so pressing a row reuses its raster. */
export function readPaint(element: HTMLElement, images: PaintImages, placement: PaintRect, dpr: number, ownOnly = false, editing?: DOMTextEditing): PaintSnapshot {
  const imageUrls: string[] = [], videos: HTMLVideoElement[] = [];
  const imageFor = (url: string) => { imageUrls.push(url); return images.get(url); };
  const bounds = element.getBoundingClientRect();
  const { width, height } = readPaintSize(element);
  const basis = readBasis(element), rotated = !isAxisAligned(basis), point = boxOrigin(bounds, basis, width, height);
  const sx = bounds.width / width || 1, sy = bounds.height / height || 1;
  const rect = (r: DOMRect, size?: { width: number; height: number }, fontHeight = 0): PaintRect => rotated ? localRect(r, basis, point, size, fontHeight) :
    ({ x: (r.x - bounds.x) / sx, y: (r.y - bounds.y) / sy, width: r.width / sx, height: r.height / sy });
  const walk = (node: Element, isRoot = false): PaintNode | null => {
    if (node.hasAttribute("data-canvas-owned")) return null;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return null;
    const box = rect(node.getBoundingClientRect(), readPaintSize(node as HTMLElement, style));
    if (!box.width) return null;
    if (node instanceof SVGSVGElement) {
      const image = imageFor(svgImage(node, true));
      const result = makeBox();
      if (image) result.children.push({ rect: box, image });
      return result;
    }
    if (node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLCanvasElement) {
      if (node instanceof HTMLVideoElement) videos.push(node);
      const image = node instanceof HTMLVideoElement ? node.readyState >= 2 && node.videoWidth ? node : null : node instanceof HTMLCanvasElement ? node : node.getAttribute("src") || node.getAttribute("srcset") ? imageFor(node.currentSrc || node.src) : null;
      const result = makeBox();
      if (image) {
        const naturalWidth = image instanceof HTMLImageElement ? image.naturalWidth : image instanceof HTMLVideoElement ? image.videoWidth : image.width;
        const naturalHeight = image instanceof HTMLImageElement ? image.naturalHeight : image instanceof HTMLVideoElement ? image.videoHeight : image.height;
        const left = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), top = parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
        const width = box.width - left - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        const height = box.height - top - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
        let w = width, h = height;
        if (naturalWidth && naturalHeight && style.objectFit !== "fill") {
          let scale = style.objectFit === "cover" ? Math.max(width / naturalWidth, height / naturalHeight) : Math.min(width / naturalWidth, height / naturalHeight);
          if (style.objectFit === "none") scale = 1;
          if (style.objectFit === "scale-down") scale = Math.min(1, scale);
          w = naturalWidth * scale; h = naturalHeight * scale;
        }
        const position = style.objectPosition.split(/\s+/);
        const offset = (v: string, space: number) => v.endsWith("%") ? parseFloat(v) * space / 100 : parseFloat(v) || 0;
        result.children.push({ rect: { x: box.x + left + offset(position[0], width - w), y: box.y + top + offset(position[1] || position[0], height - h), width: w, height: h }, image });
      }
      return result;
    }
    function makeBox(): PaintBox {
      const result: PaintBox = {
        rect: box, background: style.backgroundColor,
        borders: ["top", "right", "bottom", "left"].map(side => ({ color: style.getPropertyValue(`border-${side}-color`), width: parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0 })),
        radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(v => parseFloat(v) || 0),
        opacity: isRoot ? 1 : parseFloat(style.opacity),
        clip: style.overflow !== "visible" || /paint|strict|content/.test(style.contain) || node instanceof HTMLImageElement || node instanceof HTMLCanvasElement,
        clipShape: readOverflowClip(style, box, readPaintSize(node as HTMLElement, style).width, readPaintSize(node as HTMLElement, style).height),
        outline: style.outlineColor, outlineWidth: style.outlineStyle === "none" ? 0 : parseFloat(style.outlineWidth) || 0, outlineOffset: parseFloat(style.outlineOffset) || 0,
        children: [],
      };
      if (style.backgroundImage !== "none") {
        const match = /^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage);
        if (!match) throw new Error("Unsupported Canvas background image: " + style.backgroundImage);
        const image = imageFor(match[1]);
        if (image) {
          const insetX = parseFloat(style.borderLeftWidth) || 0, insetY = parseFloat(style.borderTopWidth) || 0;
          const area = { x: box.x + insetX, y: box.y + insetY, width: box.width - insetX - (parseFloat(style.borderRightWidth) || 0), height: box.height - insetY - (parseFloat(style.borderBottomWidth) || 0) };
          let w = image.naturalWidth, h = image.naturalHeight;
          if (style.backgroundSize === "cover" || style.backgroundSize === "contain") {
            const scale = style.backgroundSize === "cover" ? Math.max(area.width / w, area.height / h) : Math.min(area.width / w, area.height / h);
            w *= scale; h *= scale;
          } else if (style.backgroundSize !== "auto" && style.backgroundSize !== "auto auto") {
            const size = style.backgroundSize.split(/\s+/), length = (v: string, basis: number) => v.endsWith("%") ? parseFloat(v) * basis / 100 : parseFloat(v);
            const width = length(size[0], area.width), height = length(size[1] || "auto", area.height);
            if (Number.isFinite(width)) { h *= width / w; w = width; }
            if (Number.isFinite(height)) { if (!Number.isFinite(width)) w *= height / h; h = height; }
          }
          if (style.backgroundRepeat !== "no-repeat" && (w < area.width || h < area.height)) throw new Error("Unsupported repeated Canvas background");
          const position = style.backgroundPosition.split(/\s+/), offset = (v: string, space: number) => v.endsWith("%") ? parseFloat(v) * space / 100 : parseFloat(v) || 0;
          result.backgroundImage = { rect: { x: area.x + offset(position[0], area.width - w), y: area.y + offset(position[1] || position[0], area.height - h), width: w, height: h }, image };
        }
      }
      return result;
    }
    const result = makeBox();
    const addCaret = (caret: PaintRect) => result.children.push({ rect: rect(new DOMRect(caret.x, caret.y, caret.width, caret.height)), fill: style.caretColor === "auto" ? style.color : style.caretColor });
    const localSelection = (selected?: TextSelectionPaint) => selected && { ...selected, rects: selected.rects.map(r => rect(new DOMRect(r.x, r.y, r.width, r.height))) };
    const addSelection = (selection: TextSelectionPaint | undefined) => selection?.rects.forEach(r => result.children.push({ rect: { ...r, width: r.width || measureText(" ", font(style)) }, fill: selection.background }));
    const font = (s: CSSStyleDeclaration) => s.font || `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const textStyle = (s: CSSStyleDeclaration) => ({ font: font(s), color: s.color, size: parseFloat(s.fontSize), direction: s.direction as CanvasDirection,
      decoration: s.textDecorationLine.includes("underline") ? { color: s.textDecorationColor, width: parseFloat(s.textDecorationThickness) || parseFloat(s.fontSize) / 16 } : undefined,
      shadow: readBoxShadow(s.textShadow) });
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
      result.clip = true;
      const placeholder = !(node instanceof HTMLSelectElement) && !node.value;
      const s = placeholder ? getComputedStyle(node, "::placeholder") : style;
      let value = node instanceof HTMLSelectElement ? node.selectedOptions[0]?.textContent ?? "" : node.value || node.placeholder;
      if (node instanceof HTMLInputElement && node.type === "password" && node.value) value = "•".repeat(Array.from(node.value).length);
      if (editing && isTextControl(node)) {
        const layout = editing.control(node, style);
        const selection = localSelection(layout.selection);
        addSelection(selection);
        layout.runs.forEach(run => result.children.push({ rect: rect(new DOMRect(run.rect.x, run.rect.y, run.rect.width, run.rect.height)), text: run.text, ...textStyle(s), selection, opacity: placeholder ? Number(s.opacity) : 1 }));
        if (layout.caret) addCaret(layout.caret);
      } else {
        const left = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const available = box.width - left - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        result.children.push({ rect: { x: box.x + left - node.scrollLeft, y: box.y + (box.height - lineHeight) / 2,
          width: available, height: lineHeight }, text: value.replace(/\n/g, " "), ...textStyle(s), opacity: placeholder ? Number(s.opacity) : 1 });
      }
      return result;
    }
    if (node instanceof HTMLBRElement) addSelection(localSelection(editing?.lineBreak(node)));
    const pseudo = (name: "::before" | "::after") => {
      const p = getComputedStyle(node, name);
      if (p.content === "none" || p.content === "normal" || p.display === "none") return;
      const generated = /^(["'])(.*?)\1$/.exec(p.content)?.[2];
      if (generated) {
        result.children.push({ rect: { x: name === "::before" ? box.x : box.x + box.width - measureText(generated, font(p)), y: box.y + parseFloat(style.fontSize) - parseFloat(p.fontSize), width: measureText(generated, font(p)), height: parseFloat(p.fontSize) * 1.2 }, text: generated, ...textStyle(p), opacity: Number(p.opacity) });
        return;
      }
      const length = (v: string, basis: number) => v.endsWith("%") ? parseFloat(v) * basis / 100 : parseFloat(v) || 0;
      const w = p.width === "auto" ? box.width : length(p.width, box.width), h = length(p.height, box.height);
      if (!w || !h) return;
      const matrix = p.transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(p.transform);
      result.children.push({ rect: { x: box.x + length(p.left, box.width) + matrix.m41, y: box.y + length(p.top, box.height) + matrix.m42, width: w * matrix.m11, height: h * matrix.m22 }, background: p.backgroundColor,
        borders: ["top", "right", "bottom", "left"].map(side => ({ color: p.getPropertyValue(`border-${side}-color`), width: parseFloat(p.getPropertyValue(`border-${side}-width`)) || 0 })),
        radii: [p.borderTopLeftRadius, p.borderTopRightRadius, p.borderBottomRightRadius, p.borderBottomLeftRadius].map(v => parseFloat(v) || 0),
        opacity: Number(p.opacity), clip: false, outline: "transparent", outlineWidth: 0, outlineOffset: 0, children: [] });
    };
    pseudo("::before");
    // In an atomic surface, positioned auto/zero descendants paint after its
    // ordinary inline/block content. Nonzero contexts are split by the tree.
    const nodes = Array.from(node.childNodes);
    const positioned = (child: Node) => child instanceof Element && getComputedStyle(child).position !== "static";
    const children = [...nodes.filter(child => !positioned(child)), ...nodes.filter(positioned)];
    for (const child of children) {
      if (child instanceof Element) {
        if (isRoot && ownOnly) continue;
        const painted = walk(child);
        if (painted) result.children.push(painted);
      } else if (child instanceof Text && child.textContent) {
        let text = child.textContent;
        if (style.textOverflow === "ellipsis" && style.whiteSpace === "nowrap" && (node as HTMLElement).scrollWidth > (node as HTMLElement).clientWidth) {
          const width = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
          text = ellipsize(text, width, font(style));
        }
        const selected = editing?.text(child);
        const selection = localSelection(selected);
        addSelection(selection);
        const range = document.createRange();
        let line: PaintText | null = null;
        // Ranges find line boundaries only. Keep each logical line intact so
        // Canvas shapes Arabic, bidi runs, combining marks and ZWJ emoji itself.
        // Glyph x coordinates may run backwards or overlap on the same line.
        for (let i = 0; i < text.length;) {
          const character = String.fromCodePoint(text.codePointAt(i)!);
          range.setStart(child, Math.min(i, child.length)); range.setEnd(child, Math.min(i + character.length, child.length));
          i += character.length;
          let fontHeight = 0;
          if (rotated) {
            const ctx = textMeasure ?? (textMeasure = document.createElement("canvas").getContext("2d")!); ctx.font = font(style);
            const metrics = ctx.measureText(character); fontHeight = (metrics.fontBoundingBoxAscent || parseFloat(style.fontSize) * .8) + (metrics.fontBoundingBoxDescent || parseFloat(style.fontSize) * .2);
          }
          const r = rect(range.getBoundingClientRect(), undefined, fontHeight);
          if (!r.width || !r.height) {
            if (line && !/\s/.test(character)) line.text += character;
            continue;
          }
          const separateLine = line && Math.abs((line.rect.y + line.rect.height / 2) - (r.y + r.height / 2)) > Math.min(line.rect.height, r.height) / 2;
          if (!line || separateLine) {
            line = { rect: r, text: character, ...textStyle(style), selection };
            result.children.push(line);
          } else {
            line.text += character;
            const right = Math.max(line.rect.x + line.rect.width, r.x + r.width);
            const bottom = Math.max(line.rect.y + line.rect.height, r.y + r.height);
            line.rect.x = Math.min(line.rect.x, r.x); line.rect.y = Math.min(line.rect.y, r.y);
            line.rect.width = right - line.rect.x; line.rect.height = bottom - line.rect.y;
          }
        }
        const clamp = parseInt(style.webkitLineClamp);
        const lines = result.children.filter((entry): entry is PaintText => "text" in entry);
        if (clamp > 0 && lines.length > clamp) {
          lines.slice(clamp).forEach(line => result.children.splice(result.children.indexOf(line), 1));
          const last = lines[clamp - 1]; last.text = ellipsize(last.text, box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), font(style));
        }
        range.detach();
      }
    }
    pseudo("::after");
    const caret = editing?.caret(node);
    if (caret) addCaret(caret);
    return result;
  };
  const root = walk(element, true) as PaintBox;
  const shadow = readBoxShadow(getComputedStyle(element).boxShadow);
  let left = 0, top = 0, right = width, bottom = height;
  if (root && !root.clip) for (const child of root.children) {
    left = Math.min(left, child.rect.x); top = Math.min(top, child.rect.y);
    right = Math.max(right, child.rect.x + child.rect.width); bottom = Math.max(bottom, child.rect.y + child.rect.height);
  }
  // An outline is outside the owner's overflow clip, but remains inside every
  // ancestor clip. Include outward ink even for an atomic, clipped input.
  const outlineBounds = (node: PaintNode) => {
    if (!("children" in node)) return;
    const extent = Math.max(0, node.outlineOffset + node.outlineWidth);
    if (node.outlineWidth) {
      left = Math.min(left, node.rect.x - extent); top = Math.min(top, node.rect.y - extent);
      right = Math.max(right, node.rect.x + node.rect.width + extent); bottom = Math.max(bottom, node.rect.y + node.rect.height + extent);
    }
    if (!node.clip) node.children.forEach(outlineBounds);
  };
  if (root) outlineBounds(root);
  const filter = getComputedStyle(element).filter;
  if (filter !== "none") {
    const blur = Math.max(0, ...(filter.match(/blur\([\d.]+px\)/g) ?? []).map(value => parseFloat(value.slice(5)))) * 3;
    const shadow = filter.includes("drop-shadow") ? readBoxShadow(filter) : undefined;
    const margin = blur + (shadow ? shadow.blur * 3 + Math.max(Math.abs(shadow.x), Math.abs(shadow.y)) : 0);
    left -= margin; top -= margin; right += margin; bottom += margin;
  }
  // Align the bitmap origin in output space, not the glyphs inside it. A row
  // at device x=2.5 needs half a texel of leading space when placed at x=2.
  // Only the initial raster uses this phase; scrolling can still move it intact.
  const unscaled = !rotated && placement.width === width && placement.height === height;
  const x = unscaled ? placement.x : 0, y = unscaled ? placement.y : 0;
  left = Math.floor((x + left) * dpr) / dpr - x;
  top = Math.floor((y + top) * dpr) / dpr - y;
  return { width: right - left, height: bottom - top, layoutWidth: width, layoutHeight: height, offsetX: left, offsetY: top, root, shadow, imageUrls, videos, filter: filter === "none" ? undefined : filter };
}

let textMeasure: CanvasRenderingContext2D | undefined;
function measureText(text: string, font: string) {
  const ctx = textMeasure ?? (textMeasure = document.createElement("canvas").getContext("2d")!);
  ctx.font = font; return ctx.measureText(text).width;
}
function ellipsize(text: string, width: number, font: string) {
  const characters = Array.from(text); let low = 0, high = characters.length;
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (measureText(characters.slice(0, middle).join("") + "…", font) <= width) low = middle; else high = middle - 1; }
  return characters.slice(0, low).join("") + "…";
}

function rounded(ctx: CanvasRenderingContext2D, r: PaintRect, radii: number[]) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.width, r.height, radii);
}

export function shadowSnapshot(snapshot: PaintSnapshot, shadow: NonNullable<PaintSnapshot["shadow"]>): PaintSnapshot {
  const margin = shadow.blur * 2 + Math.abs(shadow.spread), left = Math.min(0, shadow.x - margin), top = Math.min(0, shadow.y - margin);
  return { ...snapshot, width: snapshot.layoutWidth + Math.max(0, shadow.x + margin) - left, height: snapshot.layoutHeight + Math.max(0, shadow.y + margin) - top, offsetX: left, offsetY: top, shadow,
    root: { ...snapshot.root, background: "transparent", borders: snapshot.root.borders.map(b => ({ ...b, width: 0 })), outlineWidth: 0, clip: false, children: [] } };
}

export function rasterPaint(snapshot: PaintSnapshot, dpr: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(snapshot.width * dpr));
  canvas.height = Math.max(1, Math.ceil(snapshot.height * dpr));
  const ctx = canvas.getContext("2d")!;
  if (snapshot.shadow && snapshot.root) {
    const shadow = document.createElement("canvas"); shadow.width = canvas.width; shadow.height = canvas.height;
    const mask = shadow.getContext("2d")!, s = snapshot.shadow, r = snapshot.root.rect;
    mask.scale(dpr, dpr); mask.translate(-snapshot.offsetX, -snapshot.offsetY);
    mask.shadowColor = s.color; mask.shadowBlur = s.blur * dpr; mask.shadowOffsetX = s.x * dpr; mask.shadowOffsetY = s.y * dpr;
    mask.fillStyle = "black";
    const shape = { x: r.x - s.spread, y: r.y - s.spread, width: r.width + 2 * s.spread, height: r.height + 2 * s.spread };
    rounded(mask, shape, snapshot.root.radii.map(v => Math.max(0, v + s.spread))); mask.fill();
    mask.globalCompositeOperation = "destination-out"; mask.shadowColor = "transparent";
    rounded(mask, r, snapshot.root.radii); mask.fill();
    ctx.drawImage(shadow, 0, 0);
  }
  ctx.scale(dpr, dpr); ctx.translate(-snapshot.offsetX, -snapshot.offsetY);
  const base = ctx;
  const paint = (node: PaintNode, ctx = base, isolated = false) => {
    if ("children" in node && node.opacity < 1 && !isolated) {
      const surface = document.createElement("canvas"); surface.width = canvas.width; surface.height = canvas.height;
      const group = surface.getContext("2d")!; group.setTransform(ctx.getTransform());
      paint(node, group, true);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha *= node.opacity; ctx.drawImage(surface, 0, 0); ctx.restore();
      return;
    }
    const r = node.rect;
    if ("text" in node) {
      ctx.save(); ctx.globalAlpha *= node.opacity ?? 1;
      if (node.shadow) { ctx.shadowColor = node.shadow.color; ctx.shadowBlur = node.shadow.blur * dpr; ctx.shadowOffsetX = node.shadow.x * dpr; ctx.shadowOffsetY = node.shadow.y * dpr; }
      ctx.font = node.font; ctx.fillStyle = node.color; ctx.textBaseline = "alphabetic";
      ctx.direction = node.direction; ctx.textAlign = "left";
      const metrics = ctx.measureText(node.text);
      const ascent = metrics.fontBoundingBoxAscent ?? node.size * 0.9;
      const descent = metrics.fontBoundingBoxDescent ?? node.size * 0.2;
      const baseline = r.y + (r.height - ascent - descent) / 2 + ascent;
      if (node.selection && node.selection.color !== node.color) {
        // Complementary clips keep native shaping intact and paint each glyph
        // region once. Repainting the ordinary glyph underneath darkens its AA.
        ctx.save();
        for (const selection of node.selection.rects) {
          ctx.beginPath(); ctx.rect(snapshot.offsetX, snapshot.offsetY, snapshot.width, snapshot.height);
          ctx.rect(selection.x, selection.y, selection.width, selection.height); ctx.clip("evenodd");
        }
        ctx.fillText(node.text, r.x, baseline); ctx.restore();
        ctx.save(); ctx.shadowColor = "transparent"; ctx.beginPath();
        node.selection.rects.forEach(s => ctx.rect(s.x, s.y, s.width, s.height)); ctx.clip();
        ctx.fillStyle = node.selection.color; ctx.fillText(node.text, r.x, baseline); ctx.restore();
      } else ctx.fillText(node.text, r.x, baseline);
      if (node.decoration) { ctx.fillStyle = node.decoration.color; ctx.fillRect(r.x, baseline + descent * .45, ctx.measureText(node.text).width, node.decoration.width); }
      ctx.restore();
    } else if ("fill" in node) {
      ctx.fillStyle = node.fill; ctx.fillRect(r.x, r.y, r.width, r.height);
    } else if ("image" in node) {
      ctx.drawImage(node.image, r.x, r.y, r.width, r.height);
    } else {
      ctx.save(); ctx.globalAlpha *= isolated ? 1 : node.opacity;
      rounded(ctx, r, node.radii); ctx.fillStyle = node.background; ctx.fill();
      if (node.backgroundImage) { ctx.save(); ctx.clip(); const image = node.backgroundImage; ctx.drawImage(image.image, image.rect.x, image.rect.y, image.rect.width, image.rect.height); ctx.restore(); }
      const border = node.borders[0];
      ctx.save();
      if (node.borders.every(b => b.width === border.width && b.color === border.color)) {
        if (border.width) {
          const half = border.width / 2;
          rounded(ctx, { x: r.x + half, y: r.y + half, width: r.width - border.width, height: r.height - border.width }, node.radii.map(v => Math.max(0, v - half)));
          ctx.strokeStyle = border.color; ctx.lineWidth = border.width; ctx.stroke();
        }
      } else {
        rounded(ctx, r, node.radii); ctx.clip();
        const corners = [[r.x, r.y, r.width, node.borders[0].width], [r.x + r.width - node.borders[1].width, r.y, node.borders[1].width, r.height], [r.x, r.y + r.height - node.borders[2].width, r.width, node.borders[2].width], [r.x, r.y, node.borders[3].width, r.height]];
        node.borders.forEach((b, i) => { ctx.fillStyle = b.color; ctx.fillRect(...corners[i] as [number, number, number, number]); });
      }
      ctx.restore();
      ctx.save();
      if (node.clip) {
        if (node.clipShape) { const shape = node.clipShape; ctx.beginPath(); ctx.roundRect(shape.rect.x, shape.rect.y, shape.rect.width, shape.rect.height, shape.radii); }
        ctx.clip();
      }
      node.children.forEach(child => paint(child, ctx)); ctx.restore();
      if (node.outlineWidth) {
        const outset = node.outlineOffset + node.outlineWidth / 2;
        rounded(ctx, { x: r.x - outset, y: r.y - outset, width: Math.max(0, r.width + 2 * outset), height: Math.max(0, r.height + 2 * outset) }, node.radii.map(radius => Math.max(0, radius + outset)));
        ctx.strokeStyle = node.outline; ctx.lineWidth = node.outlineWidth; ctx.stroke();
      }
      ctx.restore();
    }
  };
  if (snapshot.root) paint(snapshot.root);
  return canvas;
}
