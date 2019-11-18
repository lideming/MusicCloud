// TypeScript 3.7 is required.

// We don't need to use React and Vue.js ;)

/// <reference path="utils.ts" />
/// <reference path="apidef.d.ts" />


var ui = {
    bottomBar: new class {
        container: HTMLElement = document.getElementById("bottombar");
        btnAutoHide: HTMLElement = document.getElementById('btnAutoHide');
        private autoHide = true;
        setPinned(val?: boolean) {
            val = val ?? !this.autoHide;
            this.autoHide = val;
            utils.toggleClass(document.body, 'bottompinned', !val);
            if (val) this.toggle(true);
        }
        toggle(state?: boolean) {
            utils.toggleClass(this.container, 'show', state);
        }
        init() {
            var bar = this.container;
            var hideTimer = new utils.Timer(() => {
                this.toggle(false);
            });
            bar.addEventListener('mouseenter', () => {
                hideTimer.tryCancel();
                this.toggle(true);
            });
            bar.addEventListener('mouseleave', () => {
                hideTimer.tryCancel();
                if (this.autoHide) hideTimer.timeout(200);
            });
        }
    },
    progressBar: new class {
        container = document.getElementById('progressbar');
        fill = document.getElementById('progressbar-fill');
        labelCur = document.getElementById('progressbar-label-cur');
        labelTotal = document.getElementById('progressbar-label-total');

        setProg(cur: number, total: number) {
            var prog = cur / total;
            prog = utils.numLimit(prog, 0, 1);
            this.fill.style.width = (prog * 100) + '%';
            this.labelCur.textContent = utils.formatTime(cur);
            this.labelTotal.textContent = utils.formatTime(total);
        }
        setProgressChangedCallback(cb: (percent: number) => void) {
            var call = (e) => { cb(utils.numLimit(e.offsetX / this.container.clientWidth, 0, 1)); }
            this.container.addEventListener('mousedown', (e) => {
                if (e.buttons == 1) call(e);
            });
            this.container.addEventListener('mousemove', (e) => {
                if (e.buttons == 1) call(e);
            });
        }
    },
    trackinfo: new class {
        element = document.getElementById('bottombar-trackinfo');
        setTrack(track: Track) {
            if (track) {
                utils.replaceChild(this.element, utils.buildDOM({
                    tag: 'span',
                    child: [
                        'Now Playing: ',
                        { tag: 'span.name', textContent: track.name },
                        { tag: 'span.artist', textContent: track.artist },
                    ]
                }));
            } else {
                this.element.textContent = "";
            }
        }
    },
    sidebarList: new class {
        container = document.getElementById('sidebar-list');

    },
    content: new class {
        container = document.getElementById('content-outer');
        current: ContentView;
        removeCurrent() {
            const cur = this.current;
            if (!cur) return;
            if (cur.onRemove) cur.onRemove();
            if (cur.element) this.container.removeChild(cur.element);
        }
        setCurrent(arg: ContentView) {
            this.removeCurrent();
            this.container.appendChild(arg.element);
            if (arg.onShow) arg.onShow();
            this.current = arg;
        }
    }
};

interface ContentView {
    element: HTMLElement,
    onShow?: Action,
    onRemove?: Action
}

ui.bottomBar.init();

class PlayerCore {
    audio: HTMLAudioElement;
    track: Track;
    onTrackChanged: Action;
    constructor() {
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('canplay', () => this.updateProgress());
        this.audio.addEventListener('error', (e) => {
            console.log(e);
        });
        this.audio.addEventListener('ended', () => {
            this.next();
        });
        ui.progressBar.setProgressChangedCallback((x) => {
            this.audio.currentTime = x * this.audio.duration;
        });
        var ctx = new AudioContext();
        var analyzer = ctx.createAnalyser();
    }
    next() {
        if (this.track._bind && this.track._bind.next)
            this.playTrack(this.track._bind.next);
        else
            this.setTrack(null);
    }
    updateProgress() {
        ui.progressBar.setProg(this.audio.currentTime, this.audio.duration);
    }
    loadUrl(src: string) {
        this.audio.src = src;
    }
    setTrack(track: Track) {
        this.track = track;
        ui.trackinfo.setTrack(track);
        if (this.onTrackChanged) this.onTrackChanged();
        this.loadUrl(track ? track.url : "");
    }
    playTrack(track: Track) {
        if (track === this.track) return;
        this.setTrack(track);
        this.play();
    }
    play() {
        this.audio.play();
    }
    pause() {
        this.audio.pause();
    }
}

var playerCore = new PlayerCore();

var api = new class {
    baseUrl = 'api/';
    async getJson(path): Promise<any> {
        var resp = await fetch(this.baseUrl + path);
        return await resp.json();
    }
    async getListAsync(): Promise<TrackList> {
        await new TrackList().fetch('list');
        return
    }
}

interface Track extends Api.Track {
    _bind?: {
        location?: number;
        list?: TrackList;
        next?: Track;
    };
}

class View {
    private _dom: HTMLElement
    public get dom() {
        return this._dom = this._dom || this.createDom();
    }
    protected createDom(): HTMLElement {
        return document.createElement('div');
    }
    toggleClass(clsName: string, force?: boolean) {
        utils.toggleClass(this.dom, clsName, force);
    }
}

abstract class ListViewItem extends View {
}

class ListView<T extends ListViewItem> {
    container: HTMLElement;
    items: T[];
    constructor(container: BuildDomExpr) {
        this.container = utils.buildDOM(container) as HTMLElement;
        this.items = [];
    }
    add(item: T) {
        this.container.appendChild(item.dom);
        this.items.push(item);
    }
    clear() {
        utils.clearChilds(this.container);
        this.items = [];
    }
    get(idx: number) {
        return this.items[idx];
    }
}

class TrackList {
    name: string;
    tracks: Track[];
    contentView: ContentView;
    fetching: Promise<any>;
    fetchError: any;
    private curActive: TrackViewItem;
    listView: ListView<TrackViewItem>;

    loadFromObj(obj: Api.TrackList) {
        this.name = obj.name;
        this.tracks = obj.tracks;
        var i = 0;
        var lastItem: Track;
        for (const item of this.tracks) {
            item._bind = { location: i++, list: this };
            if (lastItem) lastItem._bind.next = item;
            lastItem = item;
        }
        return this;
    }
    fetch(path: string): Promise<void> {
        return this.fetching = (async () => {
            try {
                var obj = await api.getJson(path);
                this.loadFromObj(obj);
            } catch (err) {
                this.fetchError = err;
            }
            if (this.listView) this.renderUpdate();
        })();
    }
    createView(): ContentView {
        if (!this.listView) {
            this.listView = new ListView({ tag: 'div.tracklist' });
            this.contentView = {
                element: this.listView.container,
                onShow: () => {
                    playerCore.onTrackChanged = () => this.trackChanged();
                },
                onRemove: () => { }
            };
            this.renderUpdate();
        }
        return this.contentView;
    }
    private trackChanged() {
        var track = playerCore.track;
        this.curActive?.setActive(false);
        this.curActive = null;
        if (track?._bind.list !== this) return;
        var item = this.listView.get(track._bind.location);
        item.setActive(true);
        this.curActive = item;
    }
    private renderUpdate() {
        var listView = this.listView;
        if (this.tracks) {
            listView.clear();
            for (const t of this.tracks) {
                let item = new TrackViewItem(t);
                listView.add(item);
            }
        } else {
            listView.clear();
            listView.container.textContent = this.fetchError || "Loading...";
        }
    }
}

class TrackViewItem extends ListViewItem {
    track: Track;
    dom: HTMLDivElement;
    constructor(item: Track) {
        super();
        this.track = item;
    }
    createDom() {
        var track = this.track;
        return utils.buildDOM({
            tag: 'div.item.trackitem.no-selection',
            child: [
                { tag: 'span.name', textContent: track.name },
                { tag: 'span.artist', textContent: track.artist },
            ],
            onclick: () => {
                playerCore.playTrack(track);
            },
            _item: this
        }) as HTMLDivElement
    }
    setActive(active: boolean) {
        this.toggleClass('active', active);
    }
}


class ListIndex {
    
}

var list = new TrackList();
list.fetch('list');
ui.content.setCurrent(list.createView());
