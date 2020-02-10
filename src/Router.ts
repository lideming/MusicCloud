// file: Router.ts

import { ContentView, ui, SidebarItem } from "./UI";

export interface Route {
    path: string[];
    contentView?: () => ContentView;
    sidebarItem?: () => SidebarItem;
    onNav?: (arg: { path: string[], remaining: string[]; }) => void;
    onLeave?: () => void;
}

export var router = new class {
    routes: Route[] = [];
    current: string[];
    currentStr: string;
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
        if (arg.sidebarItem) arg.sidebarItem().onclick = () => {
            this.nav([...arg.path]);
        };
    }
    nav(path: string | string[], pushState?: boolean) {
        if (typeof path === 'string') path = parsePath(path);
        for (const r of this.routes) {
            if (match(path, r)) {
                if (r.contentView) ui.content.setCurrent(r.contentView());
                if (r.sidebarItem) ui.sidebarList.setActive(r.sidebarItem());
                if (r.onNav) r.onNav({ path, remaining: path.slice(r.path.length) });
                break;
            }
        }
        var strPath = path.join('/');
        this.current = path;
        this.currentStr = strPath;
        if (pushState === undefined || pushState) {
            window.history.pushState({}, strPath, '#' + strPath);
        }
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
    return path.split('/');
}