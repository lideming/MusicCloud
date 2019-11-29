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
    /** 
     * GET JSON from API
     * @param path - relative path
     * @param options
     */
    async getJson(path: string, options?: { status?: false | number }): Promise<any> {
        options = options || {};
        var resp = await this._fetch(this.baseUrl + path);
        if (options.status !== false && resp.status != (options.status ?? 200))
            throw new Error('HTTP status ' + resp.status);
        return await resp.json();
    }
    async postJson(arg: { path: string, obj: any, method?: 'POST' | 'PUT' }) {
        var resp = await this._fetch(this.baseUrl + arg.path, {
            body: JSON.stringify(arg.method),
            method: arg.method
        });
        return await resp.json();
    }
    async getListAsync(id: number): Promise<Api.TrackListGet> {
        return await this.getJson('lists/' + id);
    }
    async getListIndexAsync(): Promise<Api.TrackListIndex> {
        return await this.getJson('lists/index');
    }
    async putListAsync(list: Api.TrackListPut, creating: boolean = false): Promise<Api.TrackListPutResult> {
        return await this.postJson({
            path: 'lists/' + list.id,
            method: creating ? 'POST' : 'PUT',
            obj: list,
        });
    }
}

/** A track binding with list */
interface Track extends Api.Track {
    _bind?: {
        location?: number;
        list?: TrackList;
        next?: Track;
    };
}

var trackStore = new class TrackStore {
    trackCache: { [id: number]: Api.Track };
}

class TrackList {
    id: number;
    apiid: number;
    name: string;
    tracks: Track[] = [];
    contentView: ContentView;
    fetching: Promise<void>;
    curActive = new ItemActiveHelper<TrackViewItem>();
    /** Available when loading */
    loadIndicator: LoadingIndicator;
    /** Available when the view is created */
    listView: ListView<TrackViewItem>;

    loadInfo(info: Api.TrackListInfo) {
        this.id = info.id;
        this.apiid = this.id > 0 ? this.id : 0;
        this.name = info.name;
    }
    loadFromGetResult(obj: Api.TrackListGet) {
        this.loadInfo(obj);
        for (const t of obj.tracks) {
            this.addTrack(t);
        }
        return this;
    }
    addTrack(t: Api.Track) {
        var track: Track = {
            artist: t.artist, id: t.id, name: t.name, url: t.url,
            _bind: {
                list: this,
                location: this.tracks.length,
                next: null
            }
        };
        if (this.tracks.length) this.tracks[this.tracks.length - 1]._bind.next = track;
        this.tracks.push(track);
        return track;
    }
    loadFromApi(arg?: number | (AsyncFunc<Api.TrackListGet>)) {
        return this.fetching = this.fetching ?? this.fetchForce(arg);
    }
    async fetchForce(arg: number | (AsyncFunc<Api.TrackListGet>)) {
        var func: AsyncFunc<Api.TrackListGet>;
        if (arg === undefined) arg = this.apiid;
        if (typeof arg == 'number') func = () => api.getListAsync(arg as number);
        else func = arg;
        this.loadIndicator = new LoadingIndicator();
        this.updateView();
        try {
            var obj = await func();
            this.loadFromGetResult(obj);
            this.loadIndicator = null;
        } catch (err) {
            this.loadIndicator.status = 'error';
            this.loadIndicator.content = 'Oh no! Something just goes wrong:\n' + err
                + '\nClick here to retry';
            this.loadIndicator.onclick = () => {
                this.fetchForce(arg);
            };
        }
        this.updateView();
    }
    createView(): ContentView {
        if (!this.contentView) {
            this.listView = new ListView({ tag: 'div.tracklist' });
            let cb = () => this.trackChanged();
            this.contentView = {
                dom: this.listView.dom,
                onShow: () => {
                    playerCore.onTrackChanged.add(cb);
                    this.updateView();
                },
                onRemove: () => {
                    playerCore.onTrackChanged.remove(cb);
                    this.listView.clear();
                }
            };
            // this.updateView();
        }
        return this.contentView;
    }
    private trackChanged() {
        var track = playerCore.track;
        var item = (track?._bind.list === this) ? this.listView.get(track._bind.location) : null;
        this.curActive.set(item);
    }
    private updateView() {
        var listView = this.listView;
        if (!listView) return;
        if (this.loadIndicator) {
            listView.ReplaceChild(this.loadIndicator);
            return;
        }
        if (this.tracks.length === 0) {
            listView.ReplaceChild(new LoadingIndicator({ status: 'normal', content: '(Empty)' }));
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
            onclick: () => { playerCore.playTrack(track); },
            ondragstart: (e) => { e.dataTransfer.setData('text/plain', 'Track: ' + this.dom.textContent) },
            draggable: true,
            _item: this
        }) as HTMLDivElement
    }
}

class ListIndex {
    lists: Api.TrackListInfo[] = [];
    loadedList: { [x: number]: TrackList } = {};
    listView: ListView<ListIndexViewItem>;
    section: Section;
    loadIndicator = new LoadingIndicator();
    constructor() {
        this.listView = new ListView();
        this.listView.onItemClicked = (item) => {
            ui.sidebarList.setActive(item);
            this.showTracklist(item.listInfo.id);
        };
        this.section = new Section({
            title: 'Playlists',
            content: this.listView,
            actions: [{
                text: '➕',
                onclick: () => {
                    this.newTracklist();
                }
            }]
        });
    }
    mount() {
        ui.sidebarList.container.appendChild(this.section.dom);
    }
    /** Fetch lists from API and update the view */
    async fetch() {
        this.listView.ReplaceChild(this.loadIndicator.dom);
        var index = await api.getListIndexAsync();
        this.listView.clear();
        for (const item of index.lists) {
            this.addTracklist(item);
        }
        if (this.lists.length > 0) this.listView.onItemClicked(this.listView.items[0]);
    }
    addTracklist(list: Api.TrackListInfo) {
        this.lists.push(list);
        this.listView.add(new ListIndexViewItem(this, list))
    }
    getListInfo(id: number) {
        for (const l of this.lists) {
            if (l.id === id) return l;
        }
    }
    getList(id: number) {
        var list = this.loadedList[id];
        if (!list) {
            list = new TrackList();
            list.loadInfo(this.getListInfo(id));
            if (list.apiid) {
                list.loadFromApi();
            }
            this.loadedList[id] = list;
        }
        return list;
    }
    showTracklist(id: number) {
        var list = this.getList(id);
        ui.content.setCurrent(list.createView());
    }

    private nextId = -100;

    /** 
     * Create a Tracklist with an temporary local ID (negative number).
     * It should be sync to server and get a real ID later.
     */
    newTracklist() {
        var id = this.nextId--;
        var list: Api.TrackListInfo = {
            id,
            name: utils.createName(
                (x) => x ? `New Playlist (${x + 1})` : 'New Playlist',
                (x) => !!this.lists.find((l) => l.name == x))
        };
        this.addTracklist(list);
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
listIndex.mount();
listIndex.fetch();
