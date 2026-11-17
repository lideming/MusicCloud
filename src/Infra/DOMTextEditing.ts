import type { PaintRect } from "./CanvasPaint";

export interface TextSelectionPaint { rects: PaintRect[]; background: string; color: string }
export interface TextRun { rect: PaintRect; text: string }
export function isTextControl(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && /^(text|search|url|tel|password)$/.test(element.type);
}
function selectionColors(element: Element) {
  const style = getComputedStyle(element, "::selection");
  return { background: style.backgroundColor, color: style.color };
}
function selectionRect(r: PaintRect, lineHeight: number): PaintRect {
  const height = Math.max(r.height, lineHeight);
  return { x: r.x, y: r.y - (height - r.height) / 2, width: r.width, height };
}

/** DOM-only measurements. The mirror is never focused or selected and lives
 * outside the source tree; only numerical rectangles and strings reach paint. */
export class DOMTextEditing {
  caretVisible = true;
  private mirror: HTMLDivElement | null = null;
  private timer = 0;
  private suspended = false;
  private cleanup: (() => void)[] = [];
  constructor(private source: HTMLElement, private changed: () => void) {
    const listen = (target: EventTarget, name: string) => {
      const callback = () => this.update();
      target.addEventListener(name, callback, true);
      this.cleanup.push(() => target.removeEventListener(name, callback, true));
    };
    for (const name of ["selectionchange", "visibilitychange"]) listen(document, name);
    for (const name of ["select", "input", "focusin", "focusout", "keyup", "pointerup"]) listen(source, name);
    listen(window, "focus"); listen(window, "blur");
  }
  private hasCaret() {
    const active = document.activeElement;
    if (this.suspended || !active || !this.source.contains(active) || document.visibilityState === "hidden" || !document.hasFocus()) return false;
    if (isTextControl(active)) return !active.readOnly && !active.disabled && active.selectionStart === active.selectionEnd;
    const selection = document.getSelection();
    return active instanceof HTMLElement && active.isContentEditable && !!selection?.rangeCount && selection.isCollapsed && active.contains(selection.anchorNode);
  }
  update() {
    clearTimeout(this.timer); this.timer = 0; this.caretVisible = true;
    this.changed(); this.blink();
  }
  private blink() {
    if (!this.hasCaret()) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (!this.hasCaret()) return;
      this.caretVisible = !this.caretVisible; this.changed(); this.blink();
    }, 530);
  }
  /** Called after DOM removal and presentation changes as well as input. */
  settle(suspended = false) {
    this.suspended = suspended;
    if (!this.hasCaret()) { clearTimeout(this.timer); this.timer = 0; }
    else if (!this.timer) this.blink();
  }
  affects(element: HTMLElement, ownOnly: boolean, directText: boolean) {
    const active = document.activeElement;
    if (isTextControl(active) && (element === active || !ownOnly && element.contains(active))) return true;
    const selection = document.getSelection();
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (selection.isCollapsed && !(active instanceof HTMLElement && active.isContentEditable)) return false;
    if (!range.intersectsNode(element)) return false;
    if (ownOnly && !directText) return selection.isCollapsed && range.startContainer === element;
    if (ownOnly) return Array.from(element.childNodes).some(node => node instanceof Text && range.intersectsNode(node)) || selection.isCollapsed && range.startContainer === element;
    return true;
  }
  text(node: Text): TextSelectionPaint | undefined {
    const selection = document.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !node.parentElement || getComputedStyle(node.parentElement).userSelect === "none") return;
    const selected = selection.getRangeAt(0);
    if (!selected.intersectsNode(node)) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    if (selected.startContainer === node) range.setStart(node, selected.startOffset);
    if (selected.endContainer === node) range.setEnd(node, selected.endOffset);
    if (range.collapsed) return;
    const lineHeight = parseFloat(getComputedStyle(node.parentElement).lineHeight) || 0;
    return { rects: Array.from(range.getClientRects(), r => selectionRect(r, lineHeight)), ...selectionColors(node.parentElement) };
  }
  lineBreak(element: HTMLBRElement): TextSelectionPaint | undefined {
    const selection = document.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !selection.getRangeAt(0).intersectsNode(element)) return;
    const range = document.createRange(); range.selectNode(element);
    const style = getComputedStyle(element);
    return { rects: Array.from(range.getClientRects(), r => selectionRect(r, parseFloat(style.lineHeight) || 0)), ...selectionColors(element) };
  }
  caret(element: Element): PaintRect | undefined {
    if (!this.caretVisible || !this.hasCaret() || isTextControl(document.activeElement)) return;
    const selection = document.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0), container = range.startContainer;
    if ((container instanceof Element ? container : container.parentElement) !== element) return;
    let r = range.getClientRects()[0];
    if (!r?.height && container instanceof Text && container.length) {
      const adjacent = range.cloneRange(), index = Math.min(range.startOffset, container.length - 1);
      adjacent.setStart(container, index); adjacent.setEnd(container, index + 1);
      const box = adjacent.getBoundingClientRect();
      r = new DOMRect(range.startOffset === container.length ? box.right : box.left, box.top, 0, box.height);
    }
    if (!r?.height) {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      r = new DOMRect(box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop), 0, parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2);
    }
    return { x: r.x, y: r.y, width: 1 / devicePixelRatio, height: r.height };
  }
  control(element: HTMLInputElement | HTMLTextAreaElement, style: CSSStyleDeclaration) {
    const mirror = this.mirror ?? (this.mirror = document.createElement("div"));
    if (!mirror.isConnected) {
      mirror.setAttribute("data-canvas-owned", ""); mirror.setAttribute("aria-hidden", "true"); mirror.inert = true;
      document.documentElement.appendChild(mirror);
    }
    mirror.style.cssText = "all:initial;position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:layout style paint;";
    for (const key of ["font", "font-kerning", "font-feature-settings", "font-variation-settings", "letter-spacing", "word-spacing", "line-height", "text-align", "text-indent", "direction", "tab-size", "text-transform"]) mirror.style.setProperty(key, style.getPropertyValue(key));
    const input = element instanceof HTMLInputElement;
    mirror.style.whiteSpace = input || element.wrap === "off" ? "pre" : "pre-wrap";
    mirror.style.overflowWrap = "break-word";
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight), paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    mirror.style.width = Math.max(0, element.clientWidth - paddingX) + "px";
    let value = element.value || element.placeholder;
    const password = input && element.type === "password" && !!element.value;
    const offset = (index: number) => password ? Array.from(element.value.slice(0, index)).length : index;
    if (password) value = "•".repeat(Array.from(value).length);
    mirror.textContent = "\u200b";
    const lineHeight = parseFloat(style.lineHeight) || mirror.getBoundingClientRect().height;
    mirror.textContent = value + "\u200b";
    const text = mirror.firstChild!, range = document.createRange(), origin = mirror.getBoundingClientRect(), box = element.getBoundingClientRect();
    const sx = box.width / element.offsetWidth || 1, sy = box.height / element.offsetHeight || 1;
    const x = box.left + (element.clientLeft + parseFloat(style.paddingLeft) - element.scrollLeft) * sx;
    const y = box.top + (element.clientTop + parseFloat(style.paddingTop) + (input ? (element.clientHeight - paddingY - lineHeight) / 2 : 0) - element.scrollTop) * sy;
    const translate = (r: DOMRect): PaintRect => ({ x: x + (r.x - origin.x) * sx, y: y + (r.y - origin.y) * sy, width: r.width * sx, height: r.height * sy });
    const runs: TextRun[] = [];
    for (let i = 0; i < value.length;) {
      const character = String.fromCodePoint(value.codePointAt(i)!);
      range.setStart(text, i); range.setEnd(text, i + character.length); i += character.length;
      const r = translate(range.getBoundingClientRect()), last = runs[runs.length - 1];
      if (character === "\n" || !r.width) continue;
      if (last && Math.abs(last.rect.y - r.y) < .5) {
        last.text += character;
        const right = Math.max(last.rect.x + last.rect.width, r.x + r.width);
        last.rect.x = Math.min(last.rect.x, r.x); last.rect.width = right - last.rect.x;
      } else runs.push({ text: character, rect: r });
    }
    let selection: TextSelectionPaint | undefined, caret: PaintRect | undefined;
    if (document.activeElement === element && element.value && element.selectionStart !== null && element.selectionEnd !== null && element.selectionStart !== element.selectionEnd) {
      range.setStart(text, offset(element.selectionStart)); range.setEnd(text, offset(element.selectionEnd));
      selection = { rects: Array.from(range.getClientRects(), r => selectionRect(translate(r), lineHeight * sy)), ...selectionColors(element) };
    } else if (document.activeElement === element && this.caretVisible && this.hasCaret()) {
      const index = Math.min(offset(element.selectionStart ?? element.value.length), value.length);
      range.setStart(text, index); range.collapse(true);
      const r = translate(range.getBoundingClientRect());
      caret = { ...r, width: 1 / devicePixelRatio };
    }
    return { runs, selection, caret };
  }
  dispose() { clearTimeout(this.timer); this.cleanup.forEach(remove => remove()); this.mirror?.remove(); this.mirror = null; }
}
