// file: main.ts
// TypeScript 3.7 is required.

// Why do we need to use React and Vue.js? ;)

/// <reference path="utils.ts" />
/// <reference path="viewlib.ts" />
/// <reference path="ListContentView.ts" />
/// <reference path="apidef.d.ts" />
/// <reference path="user.ts" />
/// <reference path="tracklist.ts" />
/// <reference path="listindex.ts" />
/// <reference path="uploads.ts" />
/// <reference path="discussion.ts" />



var settings = {
    apiBaseUrl: 'api/',
    // apiBaseUrl: 'http://127.0.0.1:50074/api/',
    // apiBaseUrl: 'http://127.0.0.1:5000/api/',
    debug: true,
    apiDebugDelay: 0,
};

/** 常驻 UI 元素操作 */
var ui = new class {
    init() {
        this.lang.init();
        this.bottomBar.init();
        this.sidebarLogin.init();
    }
    lang = new class {
        availableLangs = ['en', 'zh'];
        siLang = new SettingItem('mcloud-lang', 'str', I18n.detectLanguage(this.availableLangs));
        init() {
            this.siLang.render((lang) => {
                i18n.curLang = lang;
                document.body.lang = lang;
            });
            console.log(`Current language: '${i18n.curLang}' - '${I`English`}'`);
            i18n.renderElements(document.querySelectorAll('.i18ne'));
        }
        setLang(lang: string) {
            this.siLang.set(lang);
            window.location.reload();
        }
    };
    bottomBar = new class {
        container: HTMLElement = document.getElementById("bottombar");
        btnPin: HTMLElement = document.getElementById('btnPin');
        siPin: SettingItem<boolean>;
        private pinned = true;
        hideTimer = new utils.Timer(() => { this.toggle(false); });
        shown = false;
        inTransition = false;
        setPinned(val?: boolean) {
            val = val ?? !this.pinned;
            this.pinned = val;
            utils.toggleClass(document.body, 'bottompinned', val);
            this.btnPin.textContent = val ? I`Unpin` : I`Pin`;
            if (val) this.toggle(true);
        }
        toggle(state?: boolean, hideTimeout?: number) {
            this.shown = utils.toggleClass(this.container, 'show', state);
            if (!this.pinned && hideTimeout) this.hideTimer.timeout(hideTimeout);
        }
        init() {
            var bar = this.container;
            bar.addEventListener('transitionstart', (e) => {
                if (e.target === bar && e.propertyName == 'transform') this.inTransition = true;
            });
            bar.addEventListener('transitionend', (e) => {
                if (e.target === bar && e.propertyName == 'transform') this.inTransition = false;
            });
            bar.addEventListener('transitioncancel', (e) => {
                if (e.target === bar && e.propertyName == 'transform') this.inTransition = false;
            });
            bar.addEventListener('mouseenter', () => {
                this.hideTimer.tryCancel();
                this.toggle(true);
            });
            bar.addEventListener('mouseleave', () => {
                this.hideTimer.tryCancel();
                if (!this.pinned) this.hideTimer.timeout(200);
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
                if (ui.bottomBar.shown && !ui.bottomBar.inTransition)
                    if (e.buttons == 1) call(e);
            });
            this.progbar.addEventListener('mousemove', (e) => {
                if (ui.bottomBar.shown && !ui.bottomBar.inTransition)
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
                ui.bottomBar.toggle(true, 5000);
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
            var text = this.loginState.textContent;
            var username = user.pendingInfo?.username ?? user.info.username;
            if (username) {
                text = username;
                if (user.state == 'logging') text += I` (logging in...)`;
                if (user.state == 'error') text += I` (error!)`;
                if (user.state == 'none') text += I` (not logged in)`;
            } else {
                if (user.state == 'logging') text = I`(logging...)`;
                else text = I`Guest (click to login)`;
            }
            this.loginState.textContent = text;
        }
    };
    sidebarList = new class {
        container = document.getElementById('sidebar-list');
        listview = new ListView(this.container);
        currentActive = new ItemActiveHelper<ListViewItem>();
        setActive(item: ListViewItem) {
            this.currentActive.set(item);
        }
        addItem(item: ListViewItem | string) {
            if (typeof item == 'string') item = new SidebarItem({ text: item });
            this.listview.add(item);
        }
    };
    content = new class {
        container = document.getElementById('content-outer');
        current: ContentView = null;
        removeCurrent() {
            const cur = this.current;
            this.current = null;
            if (!cur) return;
            cur.contentViewState.scrollTop = this.container.scrollTop;
            if (cur.onRemove) cur.onRemove();
            if (cur.dom) this.container.removeChild(cur.dom);
        }
        setCurrent(arg: ContentView) {
            if (arg === this.current) return;
            this.removeCurrent();
            if (arg.onShow) arg.onShow();
            if (arg.dom) this.container.appendChild(arg.dom);
            if (!arg.contentViewState) arg.contentViewState = { scrollTop: 0 };
            this.container.scrollTop = arg.contentViewState.scrollTop;
            this.current = arg;
        }
    };
}; // ui

interface ContentView {
    dom: HTMLElement;
    onShow?: Action;
    onRemove?: Action;
    contentViewState?: ContentViewState;
}

interface ContentViewState {
    scrollTop: number;
}


/** 播放器核心：控制播放逻辑 */
var playerCore = new class PlayerCore {
    audio: HTMLAudioElement;
    track: Track;
    loopMode: PlayingLoopMode = 'list-loop';
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
    }
    prev() { return this.next(-1); }
    next(offset?: number) {
        var nextTrack = this.track?._bind?.list?.getNextTrack(this.track, this.loopMode, offset);
        if (nextTrack)
            this.playTrack(nextTrack);
        else
            this.setTrack(null);
    }
    updateProgress() {
        ui.playerControl.setProg(this.audio.currentTime, this.audio.duration);
    }
    loadUrl(src: string) {
        if (src) {
            this.audio.src = src;
        } else {
            this.audio.pause();
            this.audio.removeAttribute('src');
        }
        this.audio.load();
    }
    setTrack(track: Track) {
        this.track = track;
        ui.trackinfo.setTrack(track);
        this.onTrackChanged.invoke();
        this.loadUrl(track ? api.processUrl(track.url) : null);
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

type PlayingLoopMode = 'list-seq' | 'list-loop' | 'track-loop';

/** API 操作 */
var api = new class {
    get baseUrl() { return settings.apiBaseUrl; }
    debugSleep = settings.debug ? settings.apiDebugDelay : 0;
    defaultBasicAuth: string;
    async _fetch(input: RequestInfo, init?: RequestInit) {
        if (this.debugSleep) await utils.sleepAsync(this.debugSleep * (Math.random() + 1));
        return await fetch(input, {
            credentials: 'same-origin',
            ...init
        });
    }
    getHeaders(arg: { basicAuth?: string; }) {
        arg = arg || {};
        var headers = {};
        var basicAuth = arg.basicAuth ?? this.defaultBasicAuth;
        if (basicAuth) headers['Authorization'] = 'Basic ' + utils.base64EncodeUtf8(basicAuth);
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
    async postJson(arg: {
        path: string, obj: any,
        mode?: 'json' | 'raw',
        method?: 'POST' | 'PUT' | 'DELETE',
        basicAuth?: string,
        headers?: Record<string, string>;
    }) {
        var body = arg.obj;
        if (arg.mode === undefined) arg.mode = 'json';
        if (arg.mode === 'json') body = body !== undefined ? JSON.stringify(body) : undefined;
        else if (arg.mode === 'raw') void 0; // noop
        else throw new Error('Unknown arg.mode');

        var headers = this.getHeaders(arg);
        if (arg.mode === 'json') headers['Content-Type'] = 'application/json';

        headers = { ...headers, ...arg.headers };

        var resp = await this._fetch(this.baseUrl + arg.path, {
            body: body,
            method: arg.method ?? 'POST',
            headers: headers
        });
        var contentType = resp.headers.get('Content-Type');
        if (contentType && /^application\/json;?/.test(contentType))
            return await resp.json();
        return null;
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
    processUrl(url: string) {
        if (url.match('^(https?:/)?/')) return url;
        return this.baseUrl + url;
    }
};

var trackStore = new class TrackStore {
    trackCache: { [id: number]: Api.Track; };
};


document.addEventListener('dragover', (ev) => {
    ev.preventDefault();
});
document.addEventListener('drop', (ev) => {
    ev.preventDefault();
});

// Media Session API
// https://developers.google.com/web/updates/2017/02/media-session
declare var MediaMetadata: any;
if (navigator['mediaSession']) {
    let mediaSession = navigator['mediaSession'];
    playerCore.onTrackChanged.add(() => {
        try {
            var track = playerCore.track;
            if (!track) return;
            mediaSession.metadata = new MediaMetadata({
                title: track?.name,
                artist: track?.artist
            });
        } catch { }
    });
    mediaSession.setActionHandler('play', () => playerCore.play());
    mediaSession.setActionHandler('pause', () => playerCore.pause());
    mediaSession.setActionHandler('previoustrack', () => playerCore.prev());
    mediaSession.setActionHandler('nexttrack', () => playerCore.next());
}

ui.init();

var listIndex = new ListIndex();

user.init();
uploads.init();
discussion.init();
notes.init();
listIndex.init();
