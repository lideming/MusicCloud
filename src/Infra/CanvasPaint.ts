// A small paint vocabulary for DOM-laid-out controls, not a CSS layout engine.
// All DOM reads finish before Canvas2D or WebGL drawing starts.
export interface PaintRect { x: number; y: number; width: number; height: number }
interface PaintBox {
  rect: PaintRect;
  background: string;
  borders: { color: string; width: number }[];
  radii: number[];
  opacity: number;
  clip: boolean;
  outline: string;
  outlineWidth: number;
  children: PaintNode[];
}
interface PaintText { rect: PaintRect; text: string; font: string; color: string; size: number; direction: CanvasDirection }
interface PaintImage { rect: PaintRect; image: CanvasImageSource }
type PaintNode = PaintBox | PaintText | PaintImage;
export interface PaintSnapshot {
  width: number; height: number; layoutWidth: number; layoutHeight: number;
  offsetX: number; offsetY: number; root: PaintBox;
  shadow?: { color: string; x: number; y: number; blur: number; spread: number };
}

export function readBoxShadow(value: string): PaintSnapshot["shadow"] {
  const lengths = value.match(/-?[\d.]+px/g)?.map(parseFloat), color = value.match(/rgba?\([^)]*\)/)?.[0];
  return lengths && color ? { color, x: lengths[0], y: lengths[1], blur: lengths[2] || 0, spread: lengths[3] || 0 } : undefined;
}

export class PaintImages {
  private images = new Map<string, HTMLImageElement>();
  constructor(private changed: () => void, private failed: (error: Error) => void) {}
  get(url: string) {
    let image = this.images.get(url);
    if (!image) {
      image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = this.changed;
      image.onerror = () => this.failed(new Error("Canvas paint image failed to load"));
      image.src = url;
      this.images.set(url, image);
    }
    return image.complete && image.naturalWidth ? image : null;
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
export function readPaint(element: HTMLElement, images: PaintImages, ownOnly = false): PaintSnapshot {
  const bounds = element.getBoundingClientRect();
  const { width, height } = readPaintSize(element);
  const sx = bounds.width / width || 1, sy = bounds.height / height || 1;
  const rect = (r: DOMRect): PaintRect => ({ x: (r.x - bounds.x) / sx, y: (r.y - bounds.y) / sy, width: r.width / sx, height: r.height / sy });
  const walk = (node: Element, isRoot = false): PaintNode | null => {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return null;
    const box = rect(node.getBoundingClientRect());
    if (!box.width) return null;
    if (node instanceof SVGSVGElement) {
      const image = images.get(svgImage(node, true));
      const result = makeBox();
      if (image) result.children.push({ rect: box, image });
      return result;
    }
    if (node instanceof HTMLImageElement) {
      const image = node.currentSrc || node.src ? images.get(node.currentSrc || node.src) : null;
      // The avatar background/radius is painted by its box as well.
      const result = makeBox();
      if (image) result.children.push({ rect: box, image });
      return result;
    }
    function makeBox(): PaintBox {
      return {
        rect: box, background: style.backgroundColor,
        borders: ["top", "right", "bottom", "left"].map(side => ({ color: style.getPropertyValue(`border-${side}-color`), width: parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0 })),
        radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(v => parseFloat(v) || 0),
        opacity: isRoot ? 1 : parseFloat(style.opacity),
        clip: style.overflow !== "visible" || node instanceof HTMLImageElement,
        outline: style.outlineColor, outlineWidth: style.outlineStyle === "none" ? 0 : parseFloat(style.outlineWidth) || 0,
        children: [],
      };
    }
    const result = makeBox();
    const pseudo = (name: "::before" | "::after") => {
      const p = getComputedStyle(node, name);
      if (p.content === "none" || p.content === "normal" || p.content.replace(/["']/g, "").trim() || p.display === "none") return;
      const length = (v: string, basis: number) => v.endsWith("%") ? parseFloat(v) * basis / 100 : parseFloat(v) || 0;
      const w = p.width === "auto" ? box.width : length(p.width, box.width), h = length(p.height, box.height);
      if (!w || !h) return;
      const matrix = p.transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(p.transform);
      result.children.push({ rect: { x: box.x + length(p.left, box.width) + matrix.m41, y: box.y + length(p.top, box.height) + matrix.m42, width: w * matrix.m11, height: h * matrix.m22 }, background: p.backgroundColor,
        borders: ["top", "right", "bottom", "left"].map(side => ({ color: p.getPropertyValue(`border-${side}-color`), width: parseFloat(p.getPropertyValue(`border-${side}-width`)) || 0 })),
        radii: [p.borderTopLeftRadius, p.borderTopRightRadius, p.borderBottomRightRadius, p.borderBottomLeftRadius].map(v => parseFloat(v) || 0),
        opacity: Number(p.opacity), clip: false, outline: "transparent", outlineWidth: 0, children: [] });
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
        const text = child.textContent;
        const range = document.createRange();
        let line: PaintText | null = null;
        // Ranges find line boundaries only. Keep each logical line intact so
        // Canvas shapes Arabic, bidi runs, combining marks and ZWJ emoji itself.
        // Glyph x coordinates may run backwards or overlap on the same line.
        for (let i = 0; i < text.length;) {
          const character = String.fromCodePoint(text.codePointAt(i)!);
          range.setStart(child, i); range.setEnd(child, i + character.length);
          i += character.length;
          const r = rect(range.getBoundingClientRect());
          if (!r.width || !r.height) {
            if (line && !/\s/.test(character)) line.text += character;
            continue;
          }
          const separateLine = line && Math.abs((line.rect.y + line.rect.height / 2) - (r.y + r.height / 2)) > Math.min(line.rect.height, r.height) / 2;
          if (!line || separateLine) {
            line = { rect: r, text: character, font: style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`, color: style.color, size: parseFloat(style.fontSize), direction: style.direction as CanvasDirection };
            result.children.push(line);
          } else {
            line.text += character;
            const right = Math.max(line.rect.x + line.rect.width, r.x + r.width);
            const bottom = Math.max(line.rect.y + line.rect.height, r.y + r.height);
            line.rect.x = Math.min(line.rect.x, r.x); line.rect.y = Math.min(line.rect.y, r.y);
            line.rect.width = right - line.rect.x; line.rect.height = bottom - line.rect.y;
          }
        }
        range.detach();
      }
    }
    pseudo("::after");
    return result;
  };
  const root = walk(element, true) as PaintBox;
  const shadow = readBoxShadow(getComputedStyle(element).boxShadow);
  let left = 0, top = 0, right = width, bottom = height;
  if (root && !root.clip) for (const child of root.children) {
    left = Math.min(left, child.rect.x); top = Math.min(top, child.rect.y);
    right = Math.max(right, child.rect.x + child.rect.width); bottom = Math.max(bottom, child.rect.y + child.rect.height);
  }
  return { width: right - left, height: bottom - top, layoutWidth: width, layoutHeight: height, offsetX: left, offsetY: top, root, shadow };
}

function rounded(ctx: CanvasRenderingContext2D, r: PaintRect, radii: number[]) {
  const [a, b, c, d] = radii.map(v => Math.min(v, r.width / 2, r.height / 2));
  const { x, y, width: w, height: h } = r;
  ctx.beginPath(); ctx.moveTo(x + a, y); ctx.lineTo(x + w - b, y); ctx.quadraticCurveTo(x + w, y, x + w, y + b);
  ctx.lineTo(x + w, y + h - c); ctx.quadraticCurveTo(x + w, y + h, x + w - c, y + h);
  ctx.lineTo(x + d, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - d);
  ctx.lineTo(x, y + a); ctx.quadraticCurveTo(x, y, x + a, y); ctx.closePath();
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
      ctx.font = node.font; ctx.fillStyle = node.color; ctx.textBaseline = "alphabetic";
      ctx.direction = node.direction; ctx.textAlign = "left";
      const metrics = ctx.measureText(node.text);
      const ascent = metrics.fontBoundingBoxAscent ?? node.size * 0.9;
      const descent = metrics.fontBoundingBoxDescent ?? node.size * 0.2;
      ctx.fillText(node.text, r.x, r.y + (r.height - ascent - descent) / 2 + ascent);
    } else if ("image" in node) {
      ctx.drawImage(node.image, r.x, r.y, r.width, r.height);
    } else {
      ctx.save(); ctx.globalAlpha *= isolated ? 1 : node.opacity;
      rounded(ctx, r, node.radii); ctx.fillStyle = node.background; ctx.fill();
      if (node.outlineWidth) { ctx.strokeStyle = node.outline; ctx.lineWidth = node.outlineWidth * 2; ctx.stroke(); }
      if (node.clip) ctx.clip();
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
      node.children.forEach(child => paint(child, ctx)); ctx.restore();
    }
  };
  if (snapshot.root) paint(snapshot.root);
  return canvas;
}
