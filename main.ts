// file: main.ts
// TypeScript 3.7 is required.

// Why do we need to use React and Vue.js? ;)

/// <reference path="utils.ts" />
/// <reference path="apidef.d.ts" />
/// <reference path="viewlib.ts" />
/// <reference path="user.ts" />



var settings = {
    // apiBaseUrl: 'api/',
    apiBaseUrl: 'http://localhost:50074/api/',
    // apiBaseUrl: 'http://localhost:5000/api/',
    debug: true,
    apiDebugDelay: 0,
};

/** 常驻 UI 元素操作 */
var ui = new class {
    init() {
        this.bottomBar.init();
        this.sidebarLogin.init();
    }
    bottomBar = new class {
        container: HTMLElement = document.getElementById("bottombar");
        btnPin: HTMLElement = document.getElementById('btnPin');
        siPin: SettingItem<boolean>;
        private pinned = true;
        setPinned(val?: boolean) {
            val = val ?? !this.pinned;
            this.pinned = val;
            utils.toggleClass(document.body, 'bottompinned', val);
            this.btnPin.textContent = val ? 'Unpin' : 'Pin';
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
                if (!this.pinned) hideTimer.timeout(200);
            });
            this.siPin = new SettingItem('mcloud-bottompin', 'bool', false)
                .render(x => this.setPinned(x))
                .bindToBtn(this.btnPin, ['', '']);
            // this.btnPin.addEventListener('click', () => this.setPinned());
        }
    };
    playerControl = new class {
        progbar = document.getElementById('progressbar');
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
            var call = (e) => { cb(utils.numLimit(e.offsetX / this.progbar.clientWidth, 0, 1)); };
            this.progbar.addEventListener('mousedown', (e) => {
                if (e.buttons == 1) call(e);
            });
            this.progbar.addEventListener('mousemove', (e) => {
                if (e.buttons == 1) call(e);
            });
        }
    };
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
    };
    mainContainer = new class {
        dom = document.getElementById('main-container');
    };
    sidebarLogin = new class {
        container = document.getElementById('sidebar-login');
        loginState = document.getElementById('login-state');
        init() {
            this.loginState.addEventListener('click', (ev) => {
                user.loginUI();
            });
        }
        update() {
            if (user.info.username) {
                this.loginState.textContent = user.info.username;
            } else {
                this.loginState.textContent = 'Guest (click to login)';
            }
        }
    };
    sidebarList = new class {
        container = document.getElementById('sidebar-list');
        currentActive = new ItemActiveHelper<ListViewItem>();
        setActive(item: ListViewItem) {
            this.currentActive.set(item);
        }
    };
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
            if (arg.onShow) arg.onShow();
            this.container.appendChild(arg.dom);
            this.current = arg;
        }
    };
}; // ui

interface ContentView {
    dom: HTMLElement,
    onShow?: Action,
    onRemove?: Action;
}

ui.init();

/** 播放器核心：控制播放逻辑 */
var playerCore = new class PlayerCore {
    audio: HTMLAudioElement;
    track: Track;
    onTrackChanged = new Callbacks<Action>();
    get isPlaying() { return this.audio.duration && !this.audio.paused; }
    get isPaused() { return this.audio.paused; }
    get canPlay() { return this.audio.readyState >= 2; }
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
        ui.playerControl.setProgressChangedCallback((x) => {
            this.audio.currentTime = x * this.audio.duration;
        });
        var ctx = new AudioContext();
        var analyzer = ctx.createAnalyser();
    }
    next() {
        var nextTrack = this.track?._bind?.list?.getNextTrack(this.track);
        if (nextTrack)
            this.playTrack(nextTrack);
        else
            this.setTrack(null);
    }
    updateProgress() {
        ui.playerControl.setProg(this.audio.currentTime, this.audio.duration);
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
};

/** API 操作 */
var api = new class {
    get baseUrl() { return settings.apiBaseUrl; }
    debugSleep = settings.debug ? settings.apiDebugDelay : 0;
    defaultBasicAuth: string;
    async _fetch(input: RequestInfo, init?: RequestInit) {
        if (this.debugSleep) await utils.sleepAsync(this.debugSleep * (Math.random() + 1));
        return await fetch(input, init);
    }
    getHeaders(arg: { basicAuth?: string; }) {
        arg = arg || {};
        var headers = {};
        var basicAuth = arg.basicAuth ?? this.defaultBasicAuth;
        if (basicAuth) headers['Authorization'] = 'Basic ' + btoa(basicAuth);
        return headers;
    }
    async getJson(path: string, options?: { status?: false | number, basicAuth?: string; }): Promise<any> {
        options = options || {};
        var resp = await this._fetch(this.baseUrl + path, {
            headers: { ...this.getHeaders(options) }
        });
        if (options.status !== false && resp.status != (options.status ?? 200)) {
            if (resp.status === 450) {
                try {
                    var resperr = (await resp.json()).error;
                } catch { }
                if (resperr) throw new Error(resperr);
            }
            throw new Error('HTTP status ' + resp.status);
        }
        return await resp.json();
    }
    async postJson(arg: { path: string, obj: any, method?: 'POST' | 'PUT', basicAuth?: string; }) {
        var resp = await this._fetch(this.baseUrl + arg.path, {
            body: JSON.stringify(arg.obj),
            method: arg.method ?? 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getHeaders(arg) }
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
};

/** A track binding with list */
interface Track extends Api.Track {
    _bind?: {
        position?: number;
        list?: TrackList;
    };
}

var trackStore = new class TrackStore {
    trackCache: { [id: number]: Api.Track; };
};

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
                position: this.tracks.length
            }
        };
        this.tracks.push(track);
        if (this.listView) {
            this.listView.add(new TrackViewItem(track));
        }
        return track;
    }
    loadEmpty() {
        return this.fetching = Promise.resolve();
    }
    loadFromApi(arg?: number | (AsyncFunc<Api.TrackListGet>)) {
        return this.fetching = this.fetching ?? this.fetchForce(arg);
    }
    async postToUser() {
        var obj: Api.TrackListPut = {
            id: 0,
            name: this.name,
            trackids: this.tracks.map(t => t.id)
        };
        var resp: Api.TrackListPutResult = await api.postJson({
            path: 'users/me/lists/new',
            method: 'POST',
            obj: obj
        });
        this.apiid = resp.id;
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
            this.loadIndicator.error(err, () => this.fetchForce(arg));
            throw err;
        }
        this.updateView();
    }
    createView(): ContentView {
        if (!this.contentView) {
            let cb = () => this.trackChanged();
            this.contentView = {
                dom: utils.buildDOM({ tag: 'div.tracklist' }) as HTMLElement,
                onShow: () => {
                    var lv = this.listView = this.listView || new ListView(this.contentView.dom);
                    lv.dragging = true;
                    lv.moveByDragging = true;
                    lv.onItemMoved = (item, from) => {
                        this.tracks = this.listView.map(lvi => {
                            lvi.track._bind.position = lvi.position;
                            lvi.updatePos();
                            return lvi.track;
                        });
                    };
                    this.contentView.dom = lv.dom;
                    playerCore.onTrackChanged.add(cb);
                    this.updateView();
                },
                onRemove: () => {
                    playerCore.onTrackChanged.remove(cb);
                    this.listView = null;
                }
            };
            // this.updateView();
        }
        return this.contentView;
    }
    getNextTrack(track: Track): Track {
        if (track._bind?.list === this) {
            return this.tracks[track._bind.position + 1] ?? null;
        }
        return null;
    }
    private trackChanged() {
        var track = playerCore.track;
        var item = (track?._bind.list === this) ? this.listView.get(track._bind.position) : null;
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
        var playing = playerCore.track;
        for (const t of this.tracks) {
            let item = new TrackViewItem(t);
            if (playing
                && ((playing._bind.list !== this && t.id === playing.id)
                    || playing._bind.list === this && playing._bind.position === t._bind.position))
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
    get dragData() { return `${this.track.name} - ${this.track.artist}`; }
    createDom() {
        var track = this.track;
        return {
            tag: 'div.item.trackitem.no-selection',
            child: [
                { tag: 'span.pos', textContent: (track._bind.position + 1).toString() },
                { tag: 'span.name', textContent: track.name },
                { tag: 'span.artist', textContent: track.artist },
            ],
            onclick: () => { playerCore.playTrack(track); },
            draggable: true,
            _item: this
        };
    }
    updatePos() {
        this.dom.querySelector('.pos').textContent = (this.track._bind.position + 1).toString();
    }
}

class ListIndex {
    lists: Api.TrackListInfo[] = [];
    loadedList: { [x: number]: TrackList; } = {};
    listView: ListView<ListIndexViewItem>;
    section: Section;
    loadIndicator = new LoadingIndicator();
    constructor() {
        this.listView = new ListView();
        this.listView.dragging = true;
        this.listView.moveByDragging = true;
        this.listView.onItemMoved = (item, from) => {
            this.lists = this.listView.map(x => x.listInfo);
            user.setLists(this.lists.map(l => l.id));
        };
        this.listView.onDragover = (arg) => {
            var src = arg.source;
            if (src instanceof TrackViewItem) {
                arg.accept = true;
                arg.event.dataTransfer.dropEffect = 'copy';
                if (arg.drop) {
                    var listinfo = arg.target.listInfo;
                    var list = this.getList(listinfo.id);
                    if (list.fetching) list.fetching.then(r => {
                        list.addTrack((src as TrackViewItem).track);
                    }).catch(err => {
                        console.error('error adding track:', err);
                    });
                }
            }
        };
        this.listView.onItemClicked = (item) => {
            if (ui.sidebarList.currentActive.current === item) return;
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
    init() {
        ui.sidebarList.container.appendChild(this.section.dom);
        // listIndex.fetch();
    }
    /** Fetch lists from API and update the view */
    async fetch() {
        this.loadIndicator.reset();
        this.listView.ReplaceChild(this.loadIndicator.dom);
        try {
            var index = await api.getListIndexAsync();
            this.setIndex(index);
        } catch (err) {
            this.loadIndicator.error(err, () => this.fetch());
        }
        if (this.lists.length > 0) this.listView.onItemClicked(this.listView.get(0));
    }
    setIndex(index: Api.TrackListIndex) {
        this.listView.clear();
        for (const item of index.lists) {
            this.addListInfo(item);
        }
    }
    addListInfo(listinfo: Api.TrackListInfo) {
        this.lists.push(listinfo);
        this.listView.add(new ListIndexViewItem(this, listinfo));
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
            } else {
                list.loadEmpty();
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
        this.addListInfo(list);
        var listview = this.getList(id);
        listview.postToUser().then(() => {
            list.id = listview.apiid;
        });
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
        return {
            tag: 'div.item.no-selection',
            textContent: this.listInfo.name,
        };
    }
}

document.addEventListener('drop', (ev) => {
    ev.preventDefault();
});

var listIndex = new ListIndex();
listIndex.init();
user.init();