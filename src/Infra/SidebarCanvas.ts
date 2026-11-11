import { DOMCanvasRenderer } from "./DOMCanvasRenderer";

/** Application mounting only. DOM/CSS supplies all ordinary paint membership,
 * ordering and material; renderer-only effects are declared on the DOM. */
export function createSidebarRenderer(source: HTMLElement, shell: HTMLElement) {
  try {
    const renderer = new DOMCanvasRenderer(source, shell);
    renderer.canvas.classList.add("sidebar-canvas");
    return renderer;
  } catch (error) {
    console.warn("[Sidebar] Canvas renderer unavailable; using DOM paint", error);
    return null;
  }
}
