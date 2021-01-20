// file: Router.ts

import { ui } from "./UI";
import { Callbacks } from "./utils";
import { ContentView, SidebarItem } from "./ui-views";

export interface Route {
    path: string[];
    contentView?: () => ContentView;
    sidebarItem?: () => SidebarItem;
    onNav?: (arg: { path: string[], remaining: string[]; }) => void;
    onLeave?: () => void;
}

export const router = new class {
    routes: Route[] = [];
    current: string[];
    currentStr: string;
    onNavCompleted = new Callbacks<(arg: { path: string[]; }) => void>();
    init() {
        window.addEventListener('popstate', (ev) => {
            this.navByLocation();
        });
        this.navByLocation();
    }
    private navByLocation() {
        var hash = window.location.hash;
        this.nav(hash ? hash.substr(1) : '', false);
    }
    addRoute(arg: Route) {
        this.routes.push(arg);
        if (arg.sidebarItem) arg.sidebarItem().onActive.add(() => {
            if (arg.contentView && arg.contentView().isVisible) return;
            this.nav([...arg.path]);
        });
    }
    nav(path: string | string[], pushState?: boolean | "replace") {
        if (typeof path === 'string') path = parsePath(path);
        for (const r of this.routes) {
            if (match(path, r)) {
                if (r.contentView) ui.content.setCurrent(r.contentView());
                if (r.sidebarItem) ui.sidebarList.setActive(r.sidebarItem());
                if (r.onNav) r.onNav({ path, remaining: path.slice(r.path.length) });
                break;
            }
        }
        var strPath = path.map(x => encodeURIComponent(x)).join('/');
        this.current = path;
        this.currentStr = strPath;
        if (pushState === undefined || pushState) {
            const args = [{}, strPath, '#' + strPath] as const;
            if (pushState == "replace") {
                window.history.replaceState(...args)
            } else {
                window.history.pushState(...args);
            }
        }
        this.onNavCompleted.invoke({ path });
    }
};

function match(path: string[], route: Route) {
    var rp = route.path;
    for (let i = 0; i < rp.length; i++) {
        if (path[i] !== rp[i]) return false;
    }
    return true;
}

function parsePath(path: string): string[] {
    return path.split('/').map(x => decodeURIComponent(x));
}