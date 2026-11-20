import { isTextControl } from "./DOMTextEditing";
import { DOMCanvasRenderer } from "./DOMCanvasRenderer";
import { settings } from "../Settings/Settings";

/** One scene/output for the application's existing body tree. Browser editing
 * and selection keep browser state while their pixels enter the same scene. */
export class PageCanvas {
  renderer: DOMCanvasRenderer | null = null;
  private host: HTMLDivElement | null = null;
  private editChanges = new MutationObserver(() => this.editing());
  private cleanup: (() => void)[] = [];
  constructor() {
    settings.renderer.onChanged.add(this.update);
    const listen = (name: string, callback: EventListener) => {
      document.addEventListener(name, callback, true);
      this.cleanup.push(() => document.removeEventListener(name, callback, true));
    };
    for (const name of ["focusin", "focusout", "fullscreenchange"]) {
      listen(name, () => {
        queueMicrotask(() => {
          this.editing();
          if (name === "fullscreenchange") this.renderer?.invalidate();
        });
      });
    }
    this.update();
  }
  private editing() {
    const active = document.activeElement;
    const nativeControl = active instanceof HTMLSelectElement || active instanceof HTMLInputElement && !isTextControl(active);
    const fullscreen = document.fullscreenElement;
    const native = nativeControl || !!fullscreen && !fullscreen.contains(this.host);
    this.renderer?.setNativePresentation(native);
    // Removing a focused input (for example Escape-closing its dialog) need
    // not dispatch focusout. Observe DOM changes only during native editing.
    if (native && this.renderer) this.editChanges.observe(document.body, { childList: true, subtree: true });
    else this.editChanges.disconnect();
  }
  private update = () => {
    if (settings.renderer.current === "dom") { this.release(); return; }
    if (this.renderer) return;
    const host = document.createElement("div");
    host.className = "page-canvas-host"; host.setAttribute("aria-hidden", "true");
    Object.assign(host.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483647", overflow: "hidden" });
    document.documentElement.appendChild(host);
    this.host = host;
    try {
      this.renderer = new DOMCanvasRenderer(document.body, host, { autoScrollbars: true });
      this.renderer.canvas.classList.add("page-canvas");
      this.editing();
    } catch (error) {
      this.release(); console.warn("[PageCanvas] Restoring native page", error);
    }
  };
  private release() {
    this.editChanges.disconnect();
    this.renderer?.dispose(); this.renderer = null;
    this.host?.remove(); this.host = null;
  }
  dispose() {
    settings.renderer.onChanged.remove(this.update);
    this.cleanup.forEach(remove => remove()); this.cleanup = [];
    this.release();
  }
}
