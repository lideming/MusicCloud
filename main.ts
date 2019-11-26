// file: main.ts
// TypeScript 3.7 is required.

// Why do we need to use React and Vue.js? ;)

/// <reference path="utils.ts" />
/// <reference path="apidef.d.ts" />
/// <reference path="viewlib.ts" />


var settings = {
    apiBaseUrl: 'api/',
    debug: true,
};

/** （大部分）UI 操作 */
var ui = new class {
    bottomBar = new class {
        container: HTMLElement = document.getElementById("bottombar");
        btnPin: HTMLElement = document.getElementById('btnPin');
        private autoHide = true;
        setPinned(val?: boolean) {
            val = val ?? !this.autoHide;
            this.autoHide = val;
            utils.toggleClass(document.body, 'bottompinned', !val);
            this.btnPin.textContent = !val ? 'Pinned' : 'Pin';
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
            this.btnPin.addEventListener('click', () => this.setPinned());
        }
    }
    progressBar = new class {
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
    }
    trackinfo = new class {
        element = document.getElementById('bottombar-trackinfo');
        setTrack(track: Track) {
            if (track) {
                utils.replaceChild(this.element, utils.buildDOM({
                    tag: 'span',
                    child: [
                        // 'Now Playing: ',
                        { tag: 'span.name', textContent: track.name },
                        { tag: 'span.artist', textContent: track.artist },
                    ]
                }));
            } else {
                this.element.textContent = "";
            }
        }
    }
    sidebarList = new class {
        container = document.getElementById('sidebar-list');
        currentActive = new ItemActiveHelper<ListViewItem>();
        setActive(item: ListViewItem) {
            this.currentActive.set(item);
        }
    }
    content = new class {
        container = document.getElementById('content-outer');
        current: ContentView;
        removeCurrent() {
            const cur = this.current;
            if (!cur) return;
            if (cur.onRemove) cur.onRemove();
            if (cur.dom) this.container.removeChild(cur.dom);
        }
        setCurrent(arg: ContentView) {
            this.removeCurrent();
            this.container.appendChild(arg.dom);
            if (arg.onShow) arg.onShow();
            this.current = arg;
        }
    }
} // ui

interface ContentView {
    dom: HTMLElement,
    onShow?: Action,
    onRemove?: Action
}

ui.bottomBar.init();

/** 播放器核心：控制播放逻辑 */
var playerCore = new class PlayerCore {
    audio: HTMLAudioElement;
    track: Track;
    onTrackChanged = new Callbacks<Action>();
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
        this.onTrackChanged.invoke();
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

/** API 操作 */
var api = new class {
    get baseUrl() { return settings.apiBaseUrl; }
    debugSleep = settings.debug ? 500 : 0;
    async _fetch(input: RequestInfo, init?: RequestInit) {
        if (this.debugSleep) await utils.sleepAsync(this.debugSleep * (Math.random() + 1))
        return await fetch(input, init);
    }
    async getJson(path: string, options?: { expectedOK?: boolean }): Promise<any> {
        options = options || {};
        var resp = await this._fetch(this.baseUrl + path);
        if (options.expectedOK !== false && resp.status != 200)
            throw new Error('HTTP status ' + resp.status);
        return await resp.json();
    }
    async postJson(arg: { path: string, obj: any, method?: 'POST' | 'PUT' }) {
        var resp = await this._fetch(this.baseUrl + arg.path, {
            body: JSON.stringify(arg.method),
            method: arg.method
        });
    }
    async getListAsync(id: number): Promise<Api.TrackListGet> {
        return await this.getJson('lists/' + id);
    }
    async getListIndexAsync(): Promise<Api.TrackListIndex> {
        return await this.getJson('lists/index');
    }
    async putListAsync(list: Api.TrackListPut) {
        await this.postJson({
            path: 'lists/' + list.id,
            method: 'PUT',
            obj: list,
        });
    }
}

interface Track extends Api.Track {
    _bind?: {
        location?: number;
        list?: TrackList;
        next?: Track;
    };
}

class TrackList {
    name: string;
    tracks: Track[];
    contentView: ContentView;
    fetching: Promise<void>;
    curActive = new ItemActiveHelper<TrackViewItem>();
    listView: ListView<TrackViewItem>;
    loadIndicator = new LoadingIndicator();

    loadFromObj(obj: Api.TrackListGet) {
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
    fetch(arg: number | (AsyncFunc<Api.TrackListGet>)) {
        var func: AsyncFunc<Api.TrackListGet>;
        if (typeof arg == 'number') func = () => api.getListAsync(arg as number);
        else func = arg;
        this.loadIndicator.reset();
        return this.fetching = (async () => {
            try {
                var obj = await func();
                this.loadFromObj(obj);
            } catch (err) {
                this.loadIndicator.status = 'error';
                this.loadIndicator.content = 'Oh no! Something just goes wrong:\n' + err
                    + '\nClick here to retry';
                this.loadIndicator.onclick = () => {
                    this.fetch(arg);
                };
            }
            if (this.listView) this.updateView();
        })();
    }
    createView(): ContentView {
        if (!this.contentView) {
            this.listView = new ListView({ tag: 'div.tracklist' });
            let cb = () => this.trackChanged();
            this.contentView = {
                dom: this.listView.container,
                onShow: () => {
                    playerCore.onTrackChanged.add(cb);
                    this.updateView();
                },
                onRemove: () => {
                    playerCore.onTrackChanged.remove(cb);
                }
            };
            // this.updateView();
        }
        return this.contentView;
    }
    private trackChanged() {
        var track = playerCore.track;
        var item = (track ?._bind.list === this) ? this.listView.get(track._bind.location) : null;
        this.curActive.set(item);
    }
    private updateView() {
        var listView = this.listView;
        if (!this.tracks) {
            listView.clearAndReplaceDom(this.loadIndicator.dom);
            return;
        }
        // Well... currently, we just rebuild the DOM.
        listView.clear();
        for (const t of this.tracks) {
            let item = new TrackViewItem(t);
            if (playerCore.track && t.id === playerCore.track.id)
                this.curActive.set(item);
            listView.add(item);
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
}

type LoadingIndicatorState = 'running' | 'error';

class LoadingIndicator extends View {
    private _status: LoadingIndicatorState = 'running';
    get status() { return this._status; }
    set status(val: LoadingIndicatorState) {
        this._status = val;
        this.toggleClass('running', val == 'running');
        this.toggleClass('error', val == 'error');
    }
    private _text: string;
    get content() { return this._text; }
    set content(val: string) { this._text = val; this.dom.textContent = val; }
    onclick: (e: MouseEvent) => void;
    reset() {
        this.status = 'running';
        this.content = 'Loading...';
    }
    createDom() {
        this._dom = utils.buildDOM({
            tag: 'div.loading-indicator',
            onclick: (e) => this.onclick && this.onclick(e)
        }) as HTMLElement;
        this.reset();
        return this._dom;
    }
}

class ListIndex {
    lists: Api.TrackListInfo[];
    loadedList: { [x: number]: TrackList } = {};
    listView: ListView<ListIndexViewItem>;
    // curActive = new ItemActiveHelper<ListIndexViewItem>();
    dom = document.getElementById('sidebar-list');
    loadIndicator = new LoadingIndicator();
    async fetch() {
        this.listView = new ListView(this.dom);
        this.listView.onItemClicked = (item) => {
            ui.sidebarList.setActive(item);
            this.openTracklist(item.listInfo.id);
        }
        this.updateView();
        var index = await api.getListIndexAsync();
        this.lists = index.lists;
        this.updateView();
        if (this.lists.length > 0) this.listView.onItemClicked(this.listView.items[0]);
    }
    updateView() {
        this.listView.clear();
        if (!this.lists) {
            this.listView.clearAndReplaceDom(this.loadIndicator.dom);
            return;
        }
        for (const item of this.lists) {
            this.listView.add(new ListIndexViewItem(this, item))
        }
    }
    openTracklist(id: number) {
        var list = this.loadedList[id];
        if (!list) {
            list = new TrackList();
            list.fetch(id);
            this.loadedList[id] = list;
        }
        ui.content.setCurrent(list.createView());
    }
}

class ListIndexViewItem extends ListViewItem {
    index: ListIndex;
    listInfo: Api.TrackListInfo;
    constructor(index: ListIndex, listInfo: Api.TrackListInfo) {
        super();
        this.index = index;
        this.listInfo = listInfo;
    }
    createDom() {
        return utils.buildDOM({
            tag: 'div.item.no-selection',
            textContent: this.listInfo.name,
        }) as HTMLElement;
    }
}

var listIndex = new ListIndex();
listIndex.fetch();
