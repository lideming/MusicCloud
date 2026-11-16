import { PaintRect } from "./CanvasPaint";

export interface PaintBasis { a: number; b: number; c: number; d: number }
export function readBasis(element: Element, styles?: Map<HTMLElement, CSSStyleDeclaration>, cache = new Map<Element, PaintBasis>()): PaintBasis {
  const cached = cache.get(element); if (cached) return cached;
  const parent = element.parentElement ? readBasis(element.parentElement, styles, cache) : { a: 1, b: 0, c: 0, d: 1 };
  const style = styles?.get(element as HTMLElement) ?? getComputedStyle(element);
  const matrix = style.transform === "none" ? null : new DOMMatrixReadOnly(style.transform);
  if (matrix && !matrix.is2D) throw new Error("Canvas painting requires a 2D CSS transform");
  const a = matrix?.a ?? 1, b = matrix?.b ?? 0, c = matrix?.c ?? 0, d = matrix?.d ?? 1;
  const result = { a: parent.a * a + parent.c * b, b: parent.b * a + parent.d * b, c: parent.a * c + parent.c * d, d: parent.b * c + parent.d * d };
  cache.set(element, result); return result;
}
export function isAxisAligned(basis: PaintBasis) { return Math.abs(basis.b) < 1e-7 && Math.abs(basis.c) < 1e-7 && basis.a > 0 && basis.d > 0; }
/** Transform-origin and ancestor translations are already reflected in the
 * native bounding box. Recover the transformed border-box top-left from its
 * native AABB and the known, browser-laid-out border dimensions. */
export function boxOrigin(rect: PaintRect, basis: PaintBasis, width: number, height: number) {
  return { x: rect.x - Math.min(0, basis.a * width, basis.c * height, basis.a * width + basis.c * height),
    y: rect.y - Math.min(0, basis.b * width, basis.d * height, basis.b * width + basis.d * height) };
}
export function localRect(rect: PaintRect, basis: PaintBasis, origin: { x: number; y: number }, size?: { width: number; height: number }, fontHeight = 0): PaintRect {
  // Native Range boxes are AABBs too. Recover their local extents from the two
  // projected axes; at a 45-degree degeneracy the native font's line metrics
  // provide the otherwise underdetermined text height.
  const determinant = Math.abs(basis.a) * Math.abs(basis.d) - Math.abs(basis.b) * Math.abs(basis.c);
  const height = size?.height ?? (Math.abs(determinant) > .0001 ? (Math.abs(basis.a) * rect.height - Math.abs(basis.b) * rect.width) / determinant : fontHeight);
  const width = size?.width ?? (Math.abs(basis.a) > .0001 ? (rect.width - Math.abs(basis.c) * height) / Math.abs(basis.a) : rect.height / Math.abs(basis.b));
  const point = boxOrigin(rect, basis, width, height), det = basis.a * basis.d - basis.b * basis.c;
  if (Math.abs(det) < 1e-10) return { x: 0, y: 0, width: 0, height: 0 };
  const x = point.x - origin.x, y = point.y - origin.y;
  return { x: (basis.d * x - basis.c * y) / det, y: (-basis.b * x + basis.a * y) / det, width: Math.max(0, width), height: Math.max(0, height) };
}
