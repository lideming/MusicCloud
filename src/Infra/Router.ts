// file: Router.ts

import { ui } from "./UI";
import { Callbacks } from "./utils";
import { ContentView, SidebarItem } from "./ui-views";

export interface Route {
  path: string[];
  contentView?: () => ContentView;
  sidebarItem?: () => SidebarItem;
  onNav?: (arg: { path: string[]; remaining: string[] }) => void;
  onLeave?: () => void;
}

export const router = new (class {
  routes: Route[] = [];
  current: string[];
  currentStr: string;
  currentIdx = 1;
  wasBacked = false;
  onNavCompleted = new Callbacks<(arg: { path: string[] }) => void>();
  init() {
    window.addEventListener("popstate", (ev) => {
      this.navByLocation(false);
    });
    this.navByLocation(true);
  }
  private navByLocation(replaceState: boolean) {
    var hash = window.location.hash;
    this.nav(hash ? hash.substring(1) : "", {
      pushState: replaceState ? "replace" : false,
      idx: window.history.state?.idx,
    });
  }
  addRoute(arg: Route) {
    this.routes.push(arg);
    if (arg.sidebarItem)
      arg.sidebarItem().onActive.add(() => {
        if (arg.contentView && arg.contentView().isVisible) {
          arg.contentView().onSidebarItemReactived();
          return;
        }
        this.nav([...arg.path]);
      });
  }
  nav(
    path: string | string[],
    options?: {
      pushState?: boolean | "replace";
      evenIsCurrent?: boolean;
      idx?: number;
    }
  ) {
    if (typeof path === "string") path = parsePath(path);
    var strPath = path.map((x) => encodeURIComponent(x)).join("/");
    if (this.currentStr === strPath && !options?.evenIsCurrent) return;

    this.current = path;
    this.currentStr = strPath;
    const oldIdx = this.currentIdx;
    this.currentIdx = options?.idx ?? this.currentIdx + 1;
    if (options?.idx || options?.pushState !== false)
      this.wasBacked = this.currentIdx < oldIdx;

    if (options?.pushState !== false) {
      const state = { idx: this.currentIdx };
      const url = strPath ? "#" + strPath : undefined;
      const args = [state, "", url] as const;
      if (options?.pushState == "replace") {
        window.history.replaceState(...args);
      } else {
        window.history.pushState(...args);
      }
    }

    for (const r of this.routes) {
      if (match(path, r)) {
        if (r.contentView) ui.content.setCurrent(r.contentView());
        if (r.sidebarItem) ui.sidebarList.setActive(r.sidebarItem());
        if (r.onNav) r.onNav({ path, remaining: path.slice(r.path.length) });
        break;
      }
    }

    this.onNavCompleted.invoke({ path });
  }
})();

function match(path: string[], route: Route) {
  var rp = route.path;
  for (let i = 0; i < rp.length; i++) {
    if (path[i] !== rp[i]) return false;
  }
  return true;
}

function parsePath(path: string): string[] {
  return path.split("/").map((x) => decodeURIComponent(x));
}
